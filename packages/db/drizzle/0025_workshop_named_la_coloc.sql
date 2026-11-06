-- The workshop (the tutorial's house) is shown as "La Coloc" now. Its slug `atelier` stays: room addresses use it.
-- Only that row, and only while it still has its old name: a database seeded since, or renamed by hand, is left alone.
UPDATE "houses" SET "name" = 'La Coloc' WHERE "id" = 'atelier' AND "name" = 'L''Atelier';
