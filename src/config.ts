import dotenv from 'dotenv';
import { ConfluenceConfig, WikiJsConfig } from './types';

dotenv.config();

export function loadConfig(): ConfluenceConfig {
  const requiredEnvVars = {
    baseUrl: process.env.CONFLUENCE_BASE_URL,
    username: process.env.CONFLUENCE_USERNAME,
    password: process.env.CONFLUENCE_PASSWORD,
  };

  // Check for required environment variables
  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      throw new Error(`Missing required environment variable: CONFLUENCE_${key.toUpperCase()}`);
    }
  }

  return {
    baseUrl: requiredEnvVars.baseUrl!,
    username: requiredEnvVars.username!,
    password: requiredEnvVars.password!,
    outputDir: process.env.OUTPUT_DIR || './exports',
    spaceKey: process.env.SPACE_KEY,
    ignoreSSL: process.env.IGNORE_SSL_ERRORS === 'true',
  };
}

export function loadWikiJsConfig(): WikiJsConfig {
  const requiredEnvVars = {
    baseUrl: process.env.WIKIJS_BASE_URL,
    apiKey: process.env.WIKIJS_API_KEY,
  };

  // Check for required environment variables
  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      throw new Error(`Missing required environment variable: WIKIJS_${key.toUpperCase()}`);
    }
  }

  return {
    baseUrl: requiredEnvVars.baseUrl!,
    apiKey: requiredEnvVars.apiKey!,
    uploadPath: process.env.WIKIJS_UPLOAD_PATH || '/uploads',
    namespace: process.env.WIKIJS_NAMESPACE || 'en',
  };
}
