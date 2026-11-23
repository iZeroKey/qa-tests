// Verifica por SELECT la existencia de los usuarios base antes de ejecutar pruebas.
import { verifySeededUsersExist } from "./db-dml.js";

export async function setup() {
  await verifySeededUsersExist();
}

export async function teardown() {}
