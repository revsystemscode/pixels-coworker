-- CreateTable
CREATE TABLE "whiteboards" (
    "spaceId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "elements" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whiteboards_pkey" PRIMARY KEY ("spaceId","boardId")
);

-- AddForeignKey
ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Los espacios creados antes con la plantilla de oficina reciben sus pizarras (la misma capa que
-- packages/shared/src/maps/office.json). Se cambia updatedAt para que la web descargue el mapa nuevo.
UPDATE "maps"
SET "data" = jsonb_set(
      "data" || '{"nextobjectid": 6, "nextlayerid": 9}'::jsonb,
      '{layers}',
      ("data" -> 'layers') || '[{"id": 8, "name": "whiteboards", "type": "objectgroup", "x": 0, "y": 0, "opacity": 1, "visible": true, "draworder": "topdown", "objects": [{"id": 4, "name": "Pizarra de reuniones", "type": "whiteboard", "x": 80, "y": 16, "width": 64, "height": 32, "rotation": 0, "visible": true}, {"id": 5, "name": "Pizarra de la oficina", "type": "whiteboard", "x": 144, "y": 144, "width": 64, "height": 32, "rotation": 0, "visible": true}]}]'::jsonb
    ),
    "updatedAt" = NOW()
WHERE "template" = 'office'
  AND NOT jsonb_path_exists("data", '$.layers[*] ? (@.name == "whiteboards")');
