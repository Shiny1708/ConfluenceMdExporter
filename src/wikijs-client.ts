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
   * Upload an asset (image) to Wiki.js using REST endpoint with proper metadata
   */
  async uploadAsset(filePath: string, uploadPath?: string): Promise<WikiJsAsset> {
    const fileName = path.basename(filePath);
    const targetPath = uploadPath || this.config.uploadPath || '/uploads';

    try {
      // First, get available folders to find the target folder ID
      const folders = await this.getAssetFolders(0); // Start with root folders (parentFolderId = 0)
      console.log('Available asset folders:', folders.map(f => `${f.name} (id: ${f.id}, slug: ${f.slug})`));
      
      // Find the uploads folder or use root folder
      let targetFolder = folders.find(f => f.slug === 'uploads' || f.name.toLowerCase() === 'uploads');
      if (!targetFolder) {
        // Use root folder (ID 0) as fallback
        targetFolder = { id: 0, name: 'root', slug: 'root' };
      }
      
      console.log(`Using folder: ${targetFolder.name} (id: ${targetFolder.id})`);

      // Read file
      const fileBuffer = await fs.readFile(filePath);
      const mimeType = this.getMimeType(fileName);
      
      console.log(`Upload details: fileName=${fileName}, fileSize=${fileBuffer.length}, folderId=${targetFolder.id}, mimeType=${mimeType}`);

      // Create form data for upload with proper Wiki.js format
      // Wiki.js expects two parts both named 'mediaUpload':
      // 1. JSON metadata with folderId
      // 2. The actual file data
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: mimeType });
      
      // First part: JSON metadata
      formData.append('mediaUpload', JSON.stringify({ folderId: targetFolder.id }));
      
      // Second part: File data
      formData.append('mediaUpload', blob, fileName);

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
      
      // Handle the response - Wiki.js returns upload info
      if (response.data && response.data.succeeded !== false) {
        const asset: WikiJsAsset = {
          id: response.data.id || 0,
          filename: response.data.filename || fileName,
          hash: response.data.hash || '',
          ext: response.data.ext || path.extname(fileName).substring(1),
          kind: response.data.kind || 'image',
          mime: response.data.mime || mimeType,
          fileSize: response.data.fileSize || fileBuffer.length,
          metadata: response.data.metadata || { folderId: targetFolder.id, folderName: targetFolder.name },
          createdAt: response.data.createdAt || new Date().toISOString(),
          updatedAt: response.data.updatedAt || new Date().toISOString(),
        };
        
        console.log('Successfully uploaded asset:', asset);
        return asset;
      } else {
        throw new Error(response.data?.message || 'Upload failed with unknown error');
      }
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
   * Get MIME type for a file based on its extension
   */
  private getMimeType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.svg':
        return 'image/svg+xml';
      case '.webp':
        return 'image/webp';
      case '.bmp':
        return 'image/bmp';
      default:
        return 'image/png'; // fallback
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
  async getAssetFolders(parentFolderId: number = 0): Promise<any[]> {
    const query = `
      query listAssetFolders($parentFolderId: Int!) {
        assets {
          folders(parentFolderId: $parentFolderId) {
            id
            name
            slug
          }
        }
      }
    `;

    try {
      const response = await this.client.post('', {
        query,
        variables: { parentFolderId },
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
   * Get asset information by filename
   */
  async getAssetByFilename(filename: string): Promise<any | null> {
    const query = `
      query getAssets($filename: String!) {
        assets {
          list(filename: $filename) {
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
            folder {
              id
              name
              slug
            }
          }
        }
      }
    `;

    try {
      const response = await this.client.post('', {
        query,
        variables: { filename },
      });

      if (response.data.errors) {
        console.log('Error querying asset:', response.data.errors);
        return null;
      }

      const assets = response.data.data.assets.list || [];
      return assets.length > 0 ? assets[0] : null;
    } catch (error) {
      console.log('Failed to query asset:', error);
      return null;
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
   * Construct the correct asset URL for Wiki.js
   */
  static getAssetUrl(baseUrl: string, asset: WikiJsAsset, folderName?: string): string {
    // Remove trailing slash from baseUrl
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    
    if (asset.hash) {
      // Use hash-based URL (preferred method)
      return `${cleanBaseUrl}/_assets/${asset.hash}.${asset.ext}`;
    } else {
      // Use folder-based URL - Wiki.js serves assets directly from /folder/filename
      // Get folder name from asset metadata, parameter, or default to 'uploads'
      const folder = folderName || 
                    asset.metadata?.folderName || 
                    (asset.metadata?.folderId === 0 ? '' : 'uploads'); // Root folder has no path
      
      if (folder) {
        return `/${folder}/${asset.filename}`;
      } else {
        // Root folder - no folder path needed
        return `/${asset.filename}`;
      }
    }
  }

}
