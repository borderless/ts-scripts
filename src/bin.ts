#!/usr/bin/env node

import arg from "arg";
import { main } from "./index";

const { _: args, "--help": help } = arg(
  { "--help": Boolean },
  { stopAtPositional: true }
);

if (help || args.length === 0) {
  process.stdout.write(`
  Supported commands: build, pre-commit, format, specs, test, lint, check, install
`);
  process.exit(0);
}

main(args).catch((err) => {
  console.error(err);
  process.exit(1);
});
