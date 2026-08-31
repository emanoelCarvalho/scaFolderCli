import type { ProjectConfig } from '../config/schema.js';
import { directoryNameFor } from '../util/project-name.js';

/**
 * The object exposed to templates as `it`. Templates stay declarative: they read
 * flags, they never re-derive logic from the raw config.
 */
export interface TemplateData {
  config: ProjectConfig;
  projectName: string;
  /** Folder name; differs from `projectName` for scoped packages. */
  dirName: string;
  nodeVersion: string;

  hasDatabase: boolean;
  hasOrm: boolean;
  hasAuth: boolean;
  hasRepository: boolean;
  hasTests: boolean;
  hasDocker: boolean;

  isPrisma: boolean;
  isTypeorm: boolean;
  isSequelize: boolean;
  isMongoose: boolean;

  isRelational: boolean;
  /** Default local port the generated app listens on. */
  port: number;
  /** Default container port and database port for compose files. */
  databasePort: number;
  databaseImage: string;
}

/** Node major version baked into Dockerfiles and `engines`. */
export const TARGET_NODE_VERSION = '22';

/** Default port for an API. Overridable through PORT. */
export const DEFAULT_API_PORT = 3000;

/**
 * Default port for a web client. Deliberately different from the API's: the two
 * are generated to run against each other, and colliding on 3000 would make the
 * first thing a user tries fail.
 */
export const DEFAULT_WEB_PORT = 3001;

const DATABASE_PORTS: Record<ProjectConfig['database'], number> = {
  postgresql: 5432,
  mysql: 3306,
  mongodb: 27017,
  sqlite: 0,
  none: 0,
};

const DATABASE_IMAGES: Record<ProjectConfig['database'], string> = {
  postgresql: 'postgres:16-alpine',
  mysql: 'mysql:8',
  mongodb: 'mongo:7',
  sqlite: '',
  none: '',
};

export function buildTemplateData(config: ProjectConfig): TemplateData {
  return {
    config,
    projectName: config.projectName,
    dirName: directoryNameFor(config.projectName),
    nodeVersion: TARGET_NODE_VERSION,

    hasDatabase: config.database !== 'none',
    hasOrm: config.orm !== 'none',
    hasAuth: config.authentication !== 'none',
    hasRepository: config.repositoryPattern,
    hasTests: config.testing !== 'none',
    hasDocker: config.docker,

    isPrisma: config.orm === 'prisma',
    isTypeorm: config.orm === 'typeorm',
    isSequelize: config.orm === 'sequelize',
    isMongoose: config.orm === 'mongoose',

    isRelational: ['postgresql', 'mysql', 'sqlite'].includes(config.database),
    port: config.projectType === 'web' ? DEFAULT_WEB_PORT : DEFAULT_API_PORT,
    databasePort: DATABASE_PORTS[config.database],
    databaseImage: DATABASE_IMAGES[config.database],
  };
}
