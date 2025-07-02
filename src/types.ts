export interface ConfluenceConfig {
  baseUrl: string;
  username: string;
  password: string;
  outputDir: string;
  spaceKey?: string;
  ignoreSSL?: boolean;
}

export interface ConfluencePage {
  id: string;
  title: string;
  body: {
    storage: {
      value: string;
    };
  };
  _links: {
    webui: string;
  };
  ancestors?: ConfluencePageAncestor[];
}

export interface ConfluencePageAncestor {
  id: string;
  title: string;
}

export interface ConfluenceSpace {
  key: string;
  name: string;
  id: string;
}

export interface ConfluenceSearchResult {
  results: ConfluencePage[];
  size: number;
  start: number;
  limit: number;
}

export interface WikiJsConfig {
  baseUrl: string;
  apiKey: string;
  uploadPath?: string;
}

export interface WikiJsAsset {
  id: number;
  filename: string;
  hash: string;
  ext: string;
  kind: string;
  mime: string;
  fileSize: number;
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

export interface WikiJsPage {
  id?: number;
  path: string;
  hash?: string;
  title: string;
  description?: string;
  isPrivate?: boolean;
  isPublished?: boolean;
  privateNS?: string;
  publishStartDate?: string;
  publishEndDate?: string;
  tags?: string[];
  content: string;
  contentType: string;
  createdAt?: string;
  updatedAt?: string;
  editor: string;
  locale: string;
  authorId?: number;
  creatorId?: number;
}

export interface NavigationItem {
  label: string;
  path: string;
  children?: NavigationItem[];
  icon?: string;
}
