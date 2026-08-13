type ArticleMetadata = {
  title: string;
  byline?: string | null;
  siteName?: string | null;
  excerpt?: string | null;
  lang?: string | null;
};

export type WebArticle = ArticleMetadata & {
  kind?: "web";
  url: string;
  content: string;
  images?: ArticleImage[];
};

export type TextArticle = ArticleMetadata & {
  kind: "text";
  /** Plain-text fallback used by clients before rich paste support. */
  text?: string;
  /** Sanitized again by the native host before it is written to EPUB. */
  content?: string;
  images?: ArticleImage[];
};

export type Article = WebArticle | TextArticle;

export type ArticleImage = {
  id: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif";
  data: string;
};
