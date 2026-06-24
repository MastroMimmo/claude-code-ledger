import type { Command } from 'commander';
import { registerInit } from './init';
import { registerStatus } from './status';
import { registerList } from './list';
import { registerShow } from './show';
import { registerPack } from './pack';
import { registerImport } from './import';
import { registerReplay } from './replay';
import { registerRedactTest } from './redact-test';
import { registerHook } from './hook';
import { registerStatusline } from './statusline';

export function registerCommands(program: Command): void {
  registerInit(program);
  registerStatus(program);
  registerList(program);
  registerShow(program);
  registerPack(program);
  registerImport(program);
  registerReplay(program);
  registerRedactTest(program);
  registerHook(program);
  registerStatusline(program);
}
