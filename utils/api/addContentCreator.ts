export type ContentCreatorReqBody = {
  readonly contentURL: string;
  readonly email?: string;
  readonly captchaToken: string;
};

export const addContentCreator = (requestBody: ContentCreatorReqBody) => {
  return fetch(`/api/content-creator`, {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
};
