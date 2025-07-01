import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { WikiJsConfig, WikiJsAsset, WikiJsPage } from './types';

export class WikiJsClient {
  private client: AxiosInstance;
  private config: WikiJsConfig;

  constructor(config: WikiJsConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: `${config.baseUrl}/graphql`,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Upload an asset (image) to Wiki.js
   */
  async uploadAsset(filePath: string, uploadPath?: string): Promise<WikiJsAsset> {
    const formData = new FormData();
    const fileBuffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);
    const targetPath = uploadPath || this.config.uploadPath || '/uploads';

    // Create a blob from the file buffer
    const blob = new Blob([fileBuffer]);
    formData.append('mediaUpload', blob, fileName);

    const uploadQuery = `
      mutation ($mediaUpload: Upload!, $folderId: Int!) {
        assets {
          createAsset(
            file: $mediaUpload
            folderId: $folderId
          ) {
            responseResult {
              succeeded
              errorCode
              slug
              message
            }
            asset {
              id
              filename
              hash
              ext
              kind
              mime
              fileSize
              metadata
              createdAt
              updatedAt
            }
          }
        }
      }
    `;

    try {
      // For simplicity, we'll use the REST endpoint for file upload
      const uploadClient = axios.create({
        baseURL: `${this.config.baseUrl}/u`,
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      const response = await uploadClient.post('', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        params: {
          path: targetPath,
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to upload asset ${fileName}: ${error}`);
    }
  }

  /**
   * Create or update a page in Wiki.js
   */
  async createPage(page: WikiJsPage): Promise<WikiJsPage> {
    const mutation = `
      mutation createPage($content: String!, $description: String!, $editor: String!, $isPublished: Boolean!, $isPrivate: Boolean!, $locale: String!, $path: String!, $tags: [String]!, $title: String!) {
        pages {
          create(content: $content, description: $description, editor: $editor, isPublished: $isPublished, isPrivate: $isPrivate, locale: $locale, path: $path, tags: $tags, title: $title) {
            responseResult {
              succeeded
              errorCode
              slug
              message
            }
            page {
              id
              updatedAt
            }
          }
        }
      }
    `;

    try {
      console.log('🔍 Creating page with variables:', JSON.stringify({
        content: page.content.substring(0, 100) + '...',
        description: page.description || '',
        editor: page.editor || 'markdown',
        isPublished: page.isPublished !== false,
        isPrivate: page.isPrivate || false,
        locale: page.locale || 'en',
        path: page.path.startsWith('/') ? page.path.substring(1) : page.path,
        tags: page.tags || [],
        title: page.title,
      }, null, 2));
      
      const response = await this.client.post('', {
        query: mutation,
        variables: {
          content: page.content,
          description: page.description || '',
          editor: page.editor || 'markdown',
          isPublished: page.isPublished !== false,
          isPrivate: page.isPrivate || false,
          locale: page.locale || 'en',
          path: page.path.startsWith('/') ? page.path.substring(1) : page.path, // Remove leading slash if present
          tags: page.tags || [],
          title: page.title,
        },
      });

      if (response.data.errors) {
        throw new Error(`Wiki.js API error: ${JSON.stringify(response.data.errors)}`);
      }

      const result = response.data.data.pages.create;
      if (!result.responseResult.succeeded) {
        throw new Error(`Failed to create page: ${result.responseResult.message}`);
      }

      // Return a combined object with the input data and the response
      return {
        ...page,
        id: result.page.id,
        updatedAt: result.page.updatedAt,
      };
    } catch (error) {
      throw new Error(`Failed to create Wiki.js page: ${error}`);
    }
  }

  /**
   * Update an existing page in Wiki.js
   */
  async updatePage(pageId: number, updates: Partial<WikiJsPage>): Promise<WikiJsPage> {
    const mutation = `
      mutation ($id: Int!, $content: String, $description: String, $editor: String, $isPrivate: Boolean, $isPublished: Boolean, $locale: String, $path: String, $publishEndDate: Date, $publishStartDate: Date, $tags: [String], $title: String) {
        pages {
          update(
            id: $id
            content: $content
            description: $description
            editor: $editor
            isPrivate: $isPrivate
            isPublished: $isPublished
            locale: $locale
            path: $path
            publishEndDate: $publishEndDate
            publishStartDate: $publishStartDate
            tags: $tags
            title: $title
          ) {
            responseResult {
              succeeded
              errorCode
              slug
              message
            }
            page {
              id
              path
              hash
              title
              description
              isPrivate
              isPublished
              content
              contentType
              createdAt
              updatedAt
              editor
              locale
            }
          }
        }
      }
    `;

    try {
      const response = await this.client.post('', {
        query: mutation,
        variables: {
          id: pageId,
          ...updates,
        },
      });

      if (response.data.errors) {
        throw new Error(`Wiki.js API error: ${JSON.stringify(response.data.errors)}`);
      }

      const result = response.data.data.pages.update;
      if (!result.responseResult.succeeded) {
        throw new Error(`Failed to update page: ${result.responseResult.message}`);
      }

      return result.page;
    } catch (error) {
      throw new Error(`Failed to update Wiki.js page: ${error}`);
    }
  }

  /**
   * Get page by path
   */
  async getPageByPath(path: string): Promise<WikiJsPage | null> {
    const query = `
      query ($path: String!) {
        pages {
          single(path: $path) {
            id
            path
            hash
            title
            description
            isPrivate
            isPublished
            content
            contentType
            createdAt
            updatedAt
            editor
            locale
            authorId
            creatorId
          }
        }
      }
    `;

    try {
      const response = await this.client.post('', {
        query,
        variables: { path },
      });

      if (response.data.errors) {
        return null;
      }

      return response.data.data.pages.single;
    } catch (error) {
      return null;
    }
  }

  /**
   * Query available editors from Wiki.js
   */
  async getAvailableEditors(): Promise<any[]> {
    const query = `
      query {
        editors {
          key
          isEnabled
          config {
            key
            value
          }
        }
      }
    `;

    try {
      const response = await this.client.post('', {
        query,
      });

      if (response.data.errors) {
        console.log('Error querying editors:', response.data.errors);
        return [];
      }

      return response.data.data.editors || [];
    } catch (error) {
      console.log('Failed to query editors:', error);
      return [];
    }
  }

  /**
   * Convert Confluence page path to Wiki.js compatible path
   */
  static sanitizePagePath(title: string, spaceKey?: string): string {
    // Convert to lowercase, replace spaces and special chars with hyphens
    let path = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Prepend space key if provided
    if (spaceKey) {
      path = `${spaceKey.toLowerCase()}/${path}`;
    }

    return path;
  }
}
