#!/usr/bin/env bash
set -euo pipefail

# Ejecutar desde terraform/organization, con credenciales del Learner Lab.
# Basado en el workflow que armo la catedra en itba-cloud/2026Q2-G1 (PR #7).
case "${ACCION:-}" in
  plan|apply|destroy) ;;
  *) echo '::error::ACCION debe ser plan, apply o destroy.'; exit 1 ;;
esac
for command_name in aws terraform jq; do
  command -v "$command_name" >/dev/null
done
for variable_name in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "::error::El job no recibio el secret $variable_name."
    exit 1
  fi
done
[[ "${AWS_REGION:-}" == us-east-1 ]] || { echo '::error::Este despliegue usa us-east-1.'; exit 1; }

account=$(aws sts get-caller-identity --query Account --output text)
[[ "$account" =~ ^[0-9]{12}$ ]] || { echo '::error::AWS no devolvio una cuenta valida.'; exit 1; }
bucket="itba-cloud-2026q2-g1-tfstate-${account}-${AWS_REGION}"
error_file=$(mktemp)
trap 'rm -f "$error_file"' EXIT

if ! aws s3api head-bucket --bucket "$bucket" --expected-bucket-owner "$account" 2>"$error_file"; then
  if ! grep -q '(404)' "$error_file"; then
    cat "$error_file" >&2
    exit 1
  fi
  if [[ "$ACCION" == destroy ]]; then
    echo '::error::No existe el bucket del estado; no se puede destruir un despliegue sin su estado.'
    exit 1
  fi
  aws s3api create-bucket --bucket "$bucket" --region "$AWS_REGION" >/dev/null
  aws s3api wait bucket-exists --bucket "$bucket" --expected-bucket-owner "$account"
fi

# Son llamadas soportadas por el Lab; no se usa GetBucketObjectLockConfiguration.
aws s3api put-public-access-block --bucket "$bucket" --expected-bucket-owner "$account" \
  --public-access-block-configuration 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'
aws s3api put-bucket-encryption --bucket "$bucket" --expected-bucket-owner "$account" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-bucket-versioning --bucket "$bucket" --expected-bucket-owner "$account" \
  --versioning-configuration Status=Enabled

# Override local y efimero: no modifica los archivos versionados del PR.
[[ ! -e override.tf ]] || { echo '::error::Ya existe override.tf; no se sobrescribe.'; exit 1; }
cat > override.tf <<'HCL'
terraform {
  backend "s3" {}
}
HCL
terraform init -input=false -no-color \
  -backend-config="bucket=$bucket" \
  -backend-config='key=delivery/terraform.tfstate' \
  -backend-config="region=$AWS_REGION" \
  -backend-config='encrypt=true' \
  -backend-config='use_lockfile=true'

# No crear un segundo despliegue si hay recursos de un apply local cuyo estado
# todavia no fue migrado. Con estado parcial remoto, un reintento puede continuar.
if aws s3api head-object --bucket "$bucket" --key delivery/terraform.tfstate \
  --expected-bucket-owner "$account" >/dev/null 2>"$error_file"; then
  state_resources=$(terraform state list)
elif grep -q '(404)' "$error_file"; then
  state_resources=''
else
  cat "$error_file" >&2
  exit 1
fi
if [[ -z "$state_resources" ]]; then
  if [[ "$ACCION" == destroy ]]; then
    echo '::error::El estado remoto esta vacio; no se encontro un despliegue para destruir.'
    exit 1
  fi
  functions=$(aws lambda list-functions --query "Functions[?starts_with(FunctionName, 'delivery-')].FunctionName" --output text)
  databases=$(aws rds describe-db-instances --query "DBInstances[?DBInstanceIdentifier=='delivery'].DBInstanceIdentifier" --output text)
  if [[ -n "$functions" || -n "$databases" ]]; then
    echo '::error::Existen recursos delivery pero el estado remoto esta vacio. Hay que migrar el estado anterior antes de continuar.'
    exit 1
  fi
fi
printf 'bucket=%s\n' "$bucket" >> "$GITHUB_OUTPUT"
printf 'Estado remoto listo en la cuenta %s, region %s.\n' "$account" "$AWS_REGION"
