import os

import boto3
from botocore.exceptions import ClientError

s3 = boto3.client("s3")
kinesis = boto3.client("kinesis")
REGION = os.environ["AWS_REGION"]


def handler(event, context):
    accion = event.get("tf", {}).get("action", "create")
    previo = event.get("tf", {}).get("prev_input") or {}

    if accion == "delete":
        _borrar_stream(event["stream"])
        _borrar_bucket(event["bucket"])
        return {}

    if accion == "update":
        if previo.get("stream") and previo["stream"] != event["stream"]:
            _borrar_stream(previo["stream"])
        if previo.get("bucket") and previo["bucket"] != event["bucket"]:
            _borrar_bucket(previo["bucket"])

    stream_arn = _crear_stream(event["stream"], event["shards"], event["kms_key"], event["tags"])
    _crear_bucket(event["bucket"], event["tags"])
    particion = stream_arn.split(":")[1]
    return {
        "bucket": event["bucket"],
        "bucket_arn": f"arn:{particion}:s3:::{event['bucket']}",
        "stream": event["stream"],
        "stream_arn": stream_arn,
    }


def _crear_bucket(nombre, tags):
    params = {"Bucket": nombre}
    if REGION != "us-east-1":
        params["CreateBucketConfiguration"] = {"LocationConstraint": REGION}
    try:
        s3.create_bucket(**params)
    except ClientError as e:
        if e.response["Error"]["Code"] != "BucketAlreadyOwnedByYou":
            raise
    s3.get_waiter("bucket_exists").wait(Bucket=nombre)
    _intentar(
        "etiquetar el bucket",
        s3.put_bucket_tagging,
        Bucket=nombre,
        Tagging={"TagSet": [{"Key": k, "Value": v} for k, v in tags.items()]},
    )


def _crear_stream(nombre, shards, kms_key, tags):
    try:
        kinesis.create_stream(
            StreamName=nombre,
            ShardCount=shards,
            StreamModeDetails={"StreamMode": "PROVISIONED"},
        )
    except kinesis.exceptions.ResourceInUseException:
        pass
    kinesis.get_waiter("stream_exists").wait(StreamName=nombre)

    resumen = kinesis.describe_stream_summary(StreamName=nombre)["StreamDescriptionSummary"]
    if resumen.get("EncryptionType") != "KMS":
        kinesis.start_stream_encryption(StreamName=nombre, EncryptionType="KMS", KeyId=kms_key)
        kinesis.get_waiter("stream_exists").wait(StreamName=nombre)

    if tags:
        _intentar("etiquetar el stream", kinesis.add_tags_to_stream, StreamName=nombre, Tags=tags)
    return resumen["StreamARN"]


def _borrar_bucket(nombre):
    try:
        paginas = s3.get_paginator("list_object_versions").paginate(
            Bucket=nombre, PaginationConfig={"PageSize": 500}
        )
        for pagina in paginas:
            objetos = [
                {"Key": o["Key"], "VersionId": o["VersionId"]}
                for o in pagina.get("Versions", []) + pagina.get("DeleteMarkers", [])
            ]
            if objetos:
                s3.delete_objects(Bucket=nombre, Delete={"Objects": objetos, "Quiet": True})
        s3.delete_bucket(Bucket=nombre)
    except ClientError as e:
        if e.response["Error"]["Code"] != "NoSuchBucket":
            raise


def _borrar_stream(nombre):
    try:
        kinesis.delete_stream(StreamName=nombre, EnforceConsumerDeletion=True)
    except kinesis.exceptions.ResourceNotFoundException:
        return
    kinesis.get_waiter("stream_not_exists").wait(StreamName=nombre)


def _intentar(que, llamada, **params):
    try:
        llamada(**params)
    except ClientError as e:
        print(f"[WARN] no se pudo {que}: {e.response['Error']['Code']}")
        