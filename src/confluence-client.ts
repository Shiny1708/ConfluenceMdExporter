import axios, { AxiosInstance } from 'axios';
import { ConfluenceConfig, ConfluencePage, ConfluenceSpace, ConfluenceSearchResult } from './types';

export class ConfluenceClient {
  private client: AxiosInstance;
  private config: ConfluenceConfig;

  constructor(config: ConfluenceConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: `${config.baseUrl}/wiki/rest/api`,
      auth: {
        username: config.username,
        password: config.password,
      },
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get all spaces
   */
  async getSpaces(): Promise<ConfluenceSpace[]> {
    try {
      const response = await this.client.get('/space');
      return response.data.results;
    } catch (error) {
      throw new Error(`Failed to fetch spaces: ${error}`);
    }
  }

  /**
   * Get pages from a specific space
   */
  async getPagesFromSpace(spaceKey: string, limit: number = 50, start: number = 0): Promise<ConfluenceSearchResult> {
    try {
      const response = await this.client.get(`/space/${spaceKey}/content`, {
        params: {
          limit,
          start,
          expand: 'body.storage,version,ancestors',
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch pages from space ${spaceKey}: ${error}`);
    }
  }

  /**
   * Get a specific page by ID
   */
  async getPage(pageId: string): Promise<ConfluencePage> {
    try {
      const response = await this.client.get(`/content/${pageId}`, {
        params: {
          expand: 'body.storage,version,ancestors',
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch page ${pageId}: ${error}`);
    }
  }

  /**
   * Search for pages
   */
  async searchPages(query: string, limit: number = 50): Promise<ConfluenceSearchResult> {
    try {
      const response = await this.client.get('/search', {
        params: {
          cql: query,
          limit,
          expand: 'content.body.storage,content.version,content.ancestors',
        },
      });
      return {
        results: response.data.results.map((result: any) => result.content),
        size: response.data.size,
        start: response.data.start,
        limit: response.data.limit,
      };
    } catch (error) {
      throw new Error(`Failed to search pages: ${error}`);
    }
  }

  /**
   * Get all pages from a space (handles pagination)
   */
  async getAllPagesFromSpace(spaceKey: string): Promise<ConfluencePage[]> {
    const allPages: ConfluencePage[] = [];
    let start = 0;
    const limit = 50;

    while (true) {
      const result = await this.getPagesFromSpace(spaceKey, limit, start);
      allPages.push(...result.results);

      if (result.results.length < limit) {
        break;
      }
      start += limit;
    }

    return allPages;
  }
}
