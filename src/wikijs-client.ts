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
    const fileName = path.basename(filePath);
    const targetPath = uploadPath || this.config.uploadPath || '/uploads';

    try {
      // First, get available folders to find the target folder ID
      const folders = await this.getAssetFolders();
      console.log('Available asset folders:', folders.map(f => `${f.name} (id: ${f.id}, path: ${f.path})`));
      
      // Find the uploads folder or root folder
      let targetFolder = folders.find(f => f.path === targetPath || f.slug === 'uploads' || f.name === 'uploads');
      if (!targetFolder) {
        // Use root folder (ID 0) as fallback
        targetFolder = folders.find(f => f.path === '/' || f.id === 0) || { id: 0, name: 'root', path: '/' };
      }
      
      console.log(`Using folder: ${targetFolder.name} (id: ${targetFolder.id})`);

      // Create form data for upload
      const formData = new FormData();
      const fileBuffer = await fs.readFile(filePath);
      const blob = new Blob([fileBuffer]);
      
      formData.append('mediaUpload', blob, fileName);
      formData.append('folderId', targetFolder.id.toString());

      // Use the Wiki.js upload endpoint
      const uploadClient = axios.create({
        baseURL: `${this.config.baseUrl}`,
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      const response = await uploadClient.post('/u', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('Upload response:', response.data);
      return response.data;
    } catch (error: any) {
      console.log('Upload error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          baseURL: error.config?.baseURL,
        }
      });
      throw new Error(`Failed to upload asset ${fileName}: ${error.message}`);
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
   * Get available asset folders from Wiki.js
   */
  async getAssetFolders(): Promise<any[]> {
    const query = `
      query {
        assets {
          folders {
            id
            name
            slug
            path
          }
        }
      }
    `;

    try {
      const response = await this.client.post('', {
        query,
      });

      if (response.data.errors) {
        console.log('Error querying asset folders:', response.data.errors);
        return [];
      }

      return response.data.data.assets.folders || [];
    } catch (error) {
      console.log('Failed to query asset folders:', error);
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

  /**
   * Alternative method: Convert image to base64 data URL for embedding
   */
  async convertImageToDataUrl(filePath: string): Promise<string> {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      
      let mimeType = 'image/png'; // default
      switch (ext) {
        case '.jpg':
        case '.jpeg':
          mimeType = 'image/jpeg';
          break;
        case '.png':
          mimeType = 'image/png';
          break;
        case '.gif':
          mimeType = 'image/gif';
          break;
        case '.svg':
          mimeType = 'image/svg+xml';
          break;
        case '.webp':
          mimeType = 'image/webp';
          break;
      }
      
      const base64Data = fileBuffer.toString('base64');
      return `data:${mimeType};base64,${base64Data}`;
    } catch (error) {
      throw new Error(`Failed to convert image to data URL: ${error}`);
    }
  }
}
