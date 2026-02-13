-- Create the Hatchet database alongside the main valet database.
-- PostgreSQL's docker entrypoint only creates one DB (POSTGRES_DB),
-- so Hatchet gets its own here.
CREATE DATABASE hatchet;
