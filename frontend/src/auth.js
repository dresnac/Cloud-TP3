// Login contra Cognito con SRP (amazon-cognito-identity-js): la contraseña nunca
// viaja al servidor, que es el único flujo de usuario habilitado en los App Clients.
// La librería guarda los tokens en localStorage con el App Client como clave, así
// cada app (cliente / repartidor) tiene su propia sesión y se pueden tener las dos
// abiertas a la vez. También renueva el IdToken con el refresh token cuando vence.
import { AuthenticationDetails, CognitoUser, CognitoUserPool } from "amazon-cognito-identity-js";
import { config } from "./config";

const pools = {};
function pool(app) {
  pools[app] ??= new CognitoUserPool({
    UserPoolId: config.userPoolId,
    ClientId: config.clientIds[app],
    endpoint: config.cognitoUrl,
  });
  return pools[app];
}

const MENSAJES = {
  NotAuthorizedException: "Email o contraseña incorrectos.",
  UserNotFoundException: "Email o contraseña incorrectos.",
  PasswordResetRequiredException: "Hay que restablecer la contraseña del usuario.",
  UserNotConfirmedException: "El usuario no está confirmado.",
};

function aSesion(cognitoSession) {
  const claims = cognitoSession.getIdToken().decodePayload();
  return { email: claims.email, sub: claims.sub, grupos: claims["cognito:groups"] || [] };
}

export function login(app, email, password) {
  const usuario = new CognitoUser({ Username: email, Pool: pool(app) });
  const datos = new AuthenticationDetails({ Username: email, Password: password });
  return new Promise((ok, mal) =>
    usuario.authenticateUser(datos, {
      onSuccess: (s) => ok(aSesion(s)),
      onFailure: (e) => mal(new Error(MENSAJES[e.code] || e.message || "Error de Cognito")),
      // Los usuarios de demo se crean con contraseña permanente; esto solo pasa con usuarios creados a mano.
      newPasswordRequired: () => {
        usuario.signOut();
        mal(new Error("Cognito pide cambiar la contraseña. Fijarla como permanente con admin-set-user-password."));
      },
    })
  );
}

// Sesión vigente de la app (renovándola si hace falta) o null si no hay.
export function sesionActual(app) {
  const usuario = pool(app).getCurrentUser();
  if (!usuario) return Promise.resolve(null);
  return new Promise((ok) => usuario.getSession((e, s) => ok(!e && s?.isValid() ? { usuario, sesion: s } : null)));
}

export async function sesionGuardada(app) {
  const actual = await sesionActual(app);
  return actual && aSesion(actual.sesion);
}

export function logout(app) {
  pool(app).getCurrentUser()?.signOut();
}

// Devuelve un IdToken vigente (lo lleva el grupo de Cognito que miran las Lambdas).
export async function idToken(app) {
  const actual = await sesionActual(app);
  if (!actual) {
    logout(app);
    throw new SesionVencida();
  }
  return actual.sesion.getIdToken().getJwtToken();
}

export class SesionVencida extends Error {
  constructor() {
    super("La sesión venció. Volvé a ingresar.");
  }
}
