WITH ranked AS (
	SELECT "id", row_number() OVER (
		PARTITION BY "owner_id", "exercise_id"
		ORDER BY "created_at" DESC, "id" DESC
	) AS position
	FROM "exercise_media"
	WHERE "deleted_at" IS NULL
)
UPDATE "exercise_media"
SET "deleted_at" = now()
FROM ranked
WHERE "exercise_media"."id" = ranked."id" AND ranked.position > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_media_owner_exercise_alive_uidx" ON "exercise_media" USING btree ("owner_id","exercise_id") WHERE deleted_at IS NULL;
