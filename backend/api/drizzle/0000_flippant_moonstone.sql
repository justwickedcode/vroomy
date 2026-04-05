CREATE TABLE "quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote" text NOT NULL,
	"source" text NOT NULL,
	"author" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
