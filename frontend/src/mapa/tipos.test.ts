import type { MapProps } from "../types/map";
import type { crearMapa } from "./mapa";
import type { MapaAtlas, OpcionesMapa } from "./tipos";

// Comprobaciones de tipos: las verifica `tsc -b` (npm run build); en vitest no hacen nada.
test("las props de Faro (src/types/map.ts) sirven como opciones de crearMapa", () => {
  expectTypeOf<MapProps>().toExtend<OpcionesMapa>();
});

test("crearMapa devuelve un objeto con actualizar y destruir", () => {
  expectTypeOf<ReturnType<typeof crearMapa>>().toEqualTypeOf<MapaAtlas>();
  expectTypeOf<MapaAtlas["actualizar"]>().toBeFunction();
  expectTypeOf<MapaAtlas["destruir"]>().toBeFunction();
});
