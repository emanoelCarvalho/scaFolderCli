import pc from 'picocolors';
import {
  DATABASE_ORMS,
  FRAMEWORK_CAPABILITIES,
  availableDatabases,
} from '../config/capabilities.js';
import { FRAMEWORKS, type Framework } from '../config/schema.js';
import { PRESETS } from '../config/presets.js';
import { hasGenerator } from '../generator/registry.js';
import type { Logger } from '../util/logger.js';

/**
 * Prints what this build can actually generate. Frameworks without a registered
 * generator are shown as planned rather than hidden, so the roadmap is visible
 * without promising anything.
 */
export function runListCommand(logger: Logger): void {
  logger.print(pc.bold('Frameworks'));
  for (const framework of FRAMEWORKS) {
    const capability = FRAMEWORK_CAPABILITIES[framework];
    const status = hasGenerator(framework) ? pc.green('available') : pc.dim('planned');
    logger.print(`  ${framework.padEnd(10)} ${status.padEnd(20)} ${capability.hint}`);
  }

  logger.print('');
  logger.print(pc.bold('Presets'));
  for (const preset of Object.values(PRESETS)) {
    logger.print(`  ${preset.name.padEnd(14)} ${preset.description}`);
  }

  logger.print('');
  logger.print(pc.bold('Database → ORM'));
  for (const [database, orms] of Object.entries(DATABASE_ORMS)) {
    logger.print(`  ${database.padEnd(12)} ${orms.join(', ')}`);
  }

  logger.print('');
  logger.print(pc.bold('Framework → database'));
  for (const framework of FRAMEWORKS) {
    const databases = availableDatabases(framework as Framework).map((d) => d.value);
    logger.print(`  ${framework.padEnd(12)} ${databases.join(', ')}`);
  }
}
