/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {HandlerEvent, HandlerResponse} from '@netlify/functions';

const CookieName = 'DocusaurusPlaygroundName';

const PlaygroundConfigs = {
  // Do not use this one, see
  // https://github.com/codesandbox/codesandbox-client/issues/5683#issuecomment-1023252459
  // codesandbox: 'https://codesandbox.io/s/docusaurus',
  codesandbox:
    'https://codesandbox.io/s/github/facebook/docusaurus/tree/main/examples/classic',

  // stackblitz: 'https://stackblitz.com/fork/docusaurus', // not updated
  // stackblitz: 'https://stackblitz.com/github/facebook/docusaurus/tree/main/examples/classic', // slow to load
  stackblitz: 'https://stackblitz.com/github/facebook/docusaurus/tree/starter', // dedicated branch: faster load
};

const PlaygroundDocumentationUrl = 'https://docusaurus.io/docs/playground';

export type PlaygroundName = keyof typeof PlaygroundConfigs;

function isValidPlaygroundName(
  playgroundName: string | undefined,
): playgroundName is PlaygroundName {
  return (
    !!playgroundName && Object.keys(PlaygroundConfigs).includes(playgroundName)
  );
}

export function createPlaygroundDocumentationResponse(): HandlerResponse {
  return {
    statusCode: 302,
    headers: {
      Location: PlaygroundDocumentationUrl,
    },
  };
}

export function createPlaygroundResponse(
  playgroundName: PlaygroundName,
): HandlerResponse {
  const playgroundUrl = PlaygroundConfigs[playgroundName];
  return {
    statusCode: 302,
    headers: {
      Location: playgroundUrl,
      'Set-Cookie': `${CookieName}=${playgroundName}`,
    },
  };
}

// Inspired by https://stackoverflow.com/a/3409200/82609
function parseCookieString(cookieString: string): {[key: string]: string} {
  const result: {[key: string]: string} = {};
  cookieString.split(';').forEach((cookie) => {
    const [name, value] = cookie.split('=') as [string, string];
    result[name.trim()] = decodeURI(value);
  });
  return result;
}

export function readPlaygroundName(
  event: HandlerEvent,
): PlaygroundName | undefined {
  const parsedCookie: {[key: string]: string} = event.headers.cookie
    ? parseCookieString(event.headers.cookie)
    : {};
  const playgroundName: string | undefined = parsedCookie[CookieName];

  if (!isValidPlaygroundName(playgroundName)) {
    console.error(
      `playgroundName found in cookie was invalid: ${playgroundName}`,
    );
    return undefined;
  }
  return playgroundName;
}
