#!/usr/bin/env tsx
import { readFileSync } from "fs";
import { validateCardUpdateArtifact } from "../lib/card-update-artifact";

function usage(): never {
  console.error("Usage: npm run artifact:validate -- <artifact.json>");
  process.exit(2);
}

const artifactPath = process.argv[2];
if (!artifactPath || artifactPath === "-h" || artifactPath === "--help") usage();

let parsed: unknown;
try {
  parsed = JSON.parse(readFileSync(artifactPath, "utf8"));
} catch (error) {
  console.error(`Failed to read/parse ${artifactPath}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const result = validateCardUpdateArtifact(parsed);

console.log(JSON.stringify(result, null, 2));

if (!result.ok) process.exit(1);
