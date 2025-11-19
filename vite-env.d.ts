declare namespace NodeJS {
  interface ProcessEnv {
    API_KEY: string;
    SPOTIFY_CLIENT_ID: string;
    [key: string]: string | undefined;
  }
}
