// globalSetup de Vitest: prepara la base de pruebas (pixels_test) una vez por ejecución.
import { prepareTestDatabase } from '@pixels/db/testing';

export default async function setup() {
  await prepareTestDatabase();
}
