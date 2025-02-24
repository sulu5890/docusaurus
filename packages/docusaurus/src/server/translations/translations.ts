/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from 'path';
import fs from 'fs-extra';
import _ from 'lodash';
import type {
  TranslationFileContent,
  TranslationFile,
  TranslationMessage,
  InitializedPlugin,
} from '@docusaurus/types';
import {
  getPluginI18nPath,
  toMessageRelativeFilePath,
  I18N_DIR_NAME,
  CODE_TRANSLATIONS_FILE_NAME,
} from '@docusaurus/utils';
import {Joi} from '@docusaurus/utils-validation';
import logger from '@docusaurus/logger';

export type WriteTranslationsOptions = {
  override?: boolean;
  messagePrefix?: string;
};

type TranslationContext = {
  siteDir: string;
  locale: string;
};

const TranslationFileContentSchema = Joi.object<TranslationFileContent>()
  .pattern(
    Joi.string(),
    Joi.object({
      message: Joi.string().allow('').required(),
      description: Joi.string().optional(),
    }),
  )
  .required();

function ensureTranslationFileContent(
  content: unknown,
): asserts content is TranslationFileContent {
  Joi.attempt(content, TranslationFileContentSchema, {
    abortEarly: false,
    allowUnknown: false,
    convert: false,
  });
}

async function readTranslationFileContent(
  filePath: string,
): Promise<TranslationFileContent | undefined> {
  if (await fs.pathExists(filePath)) {
    try {
      const content = JSON.parse(await fs.readFile(filePath, 'utf8'));
      ensureTranslationFileContent(content);
      return content;
    } catch (err) {
      logger.error`Invalid translation file at path=${filePath}.`;
      throw err;
    }
  }
  return undefined;
}

function mergeTranslationFileContent({
  existingContent = {},
  newContent,
  options,
}: {
  existingContent: TranslationFileContent | undefined;
  newContent: TranslationFileContent;
  options: WriteTranslationsOptions;
}): TranslationFileContent {
  // Apply messagePrefix to all messages
  const newContentTransformed = _.mapValues(newContent, (value) => ({
    ...value,
    message: `${options.messagePrefix ?? ''}${value.message}`,
  }));

  const result: TranslationFileContent = {...existingContent};

  // We only add missing keys here, we don't delete existing ones
  Object.entries(newContentTransformed).forEach(
    ([key, {message, description}]) => {
      result[key] = {
        // If messages already exist, we don't override them (unless requested)
        message: options.override
          ? message
          : existingContent[key]?.message ?? message,
        description, // description
      };
    },
  );

  return result;
}

async function writeTranslationFileContent({
  filePath,
  content: newContent,
  options = {},
}: {
  filePath: string;
  content: TranslationFileContent;
  options?: WriteTranslationsOptions;
}): Promise<void> {
  const existingContent = await readTranslationFileContent(filePath);

  // Warn about potential legacy keys
  const unknownKeys = _.difference(
    Object.keys(existingContent ?? {}),
    Object.keys(newContent),
  );
  if (unknownKeys.length > 0) {
    logger.warn`Some translation keys looks unknown to us in file path=${filePath}.
Maybe you should remove them? ${unknownKeys}`;
  }

  const mergedContent = mergeTranslationFileContent({
    existingContent,
    newContent,
    options,
  });

  // Avoid creating empty translation files
  if (Object.keys(mergedContent).length > 0) {
    logger.info`number=${
      Object.keys(mergedContent).length
    } translations will be written at path=${toMessageRelativeFilePath(
      filePath,
    )}.`;
    await fs.outputFile(
      filePath,
      `${JSON.stringify(mergedContent, null, 2)}\n`,
    );
  }
}

// should we make this configurable?
function getTranslationsDirPath(context: TranslationContext): string {
  return path.resolve(path.join(context.siteDir, I18N_DIR_NAME));
}
export function getTranslationsLocaleDirPath(
  context: TranslationContext,
): string {
  return path.join(getTranslationsDirPath(context), context.locale);
}

function getCodeTranslationsFilePath(context: TranslationContext): string {
  return path.join(
    getTranslationsLocaleDirPath(context),
    CODE_TRANSLATIONS_FILE_NAME,
  );
}

export async function readCodeTranslationFileContent(
  context: TranslationContext,
): Promise<TranslationFileContent | undefined> {
  return readTranslationFileContent(getCodeTranslationsFilePath(context));
}
export async function writeCodeTranslations(
  context: TranslationContext,
  content: TranslationFileContent,
  options: WriteTranslationsOptions,
): Promise<void> {
  return writeTranslationFileContent({
    filePath: getCodeTranslationsFilePath(context),
    content,
    options,
  });
}

// We ask users to not provide any extension on purpose:
// maybe some day we'll want to support multiple FS formats?
// (json/yaml/toml/xml...)
function addTranslationFileExtension(translationFilePath: string) {
  if (translationFilePath.endsWith('.json')) {
    throw new Error(
      `Translation file path at "${translationFilePath}" does not need to end with ".json", we add the extension automatically.`,
    );
  }
  return `${translationFilePath}.json`;
}

function getPluginTranslationFilePath({
  siteDir,
  plugin,
  locale,
  translationFilePath,
}: TranslationContext & {
  plugin: InitializedPlugin;
  translationFilePath: string;
}): string {
  const dirPath = getPluginI18nPath({
    siteDir,
    locale,
    pluginName: plugin.name,
    pluginId: plugin.options.id,
  });
  const filePath = addTranslationFileExtension(translationFilePath);
  return path.join(dirPath, filePath);
}

export async function writePluginTranslations({
  siteDir,
  plugin,
  locale,
  translationFile,
  options,
}: TranslationContext & {
  plugin: InitializedPlugin;
  translationFile: TranslationFile;
  options?: WriteTranslationsOptions;
}): Promise<void> {
  const filePath = getPluginTranslationFilePath({
    plugin,
    siteDir,
    locale,
    translationFilePath: translationFile.path,
  });
  await writeTranslationFileContent({
    filePath,
    content: translationFile.content,
    options,
  });
}

export async function localizePluginTranslationFile({
  siteDir,
  plugin,
  locale,
  translationFile,
}: TranslationContext & {
  plugin: InitializedPlugin;
  translationFile: TranslationFile;
}): Promise<TranslationFile> {
  const filePath = getPluginTranslationFilePath({
    plugin,
    siteDir,
    locale,
    translationFilePath: translationFile.path,
  });

  const localizedContent = await readTranslationFileContent(filePath);

  if (localizedContent) {
    // localized messages "override" default unlocalized messages
    return {
      path: translationFile.path,
      content: {
        ...translationFile.content,
        ...localizedContent,
      },
    };
  }
  return translationFile;
}

export async function getPluginsDefaultCodeTranslationMessages(
  plugins: InitializedPlugin[],
): Promise<{[msgId: string]: string}> {
  const pluginsMessages = await Promise.all(
    plugins.map((plugin) => plugin.getDefaultCodeTranslationMessages?.() ?? {}),
  );

  return pluginsMessages.reduce(
    (allMessages, pluginMessages) => ({...allMessages, ...pluginMessages}),
    {},
  );
}

export function applyDefaultCodeTranslations({
  extractedCodeTranslations,
  defaultCodeMessages,
}: {
  extractedCodeTranslations: {[msgId: string]: TranslationMessage};
  defaultCodeMessages: {[msgId: string]: string};
}): {[msgId: string]: TranslationMessage} {
  const unusedDefaultCodeMessages = _.difference(
    Object.keys(defaultCodeMessages),
    Object.keys(extractedCodeTranslations),
  );
  if (unusedDefaultCodeMessages.length > 0) {
    logger.warn`Unused default message codes found.
Please report this Docusaurus issue. name=${unusedDefaultCodeMessages}`;
  }

  return _.mapValues(
    extractedCodeTranslations,
    (messageTranslation, messageId) => ({
      ...messageTranslation,
      message: defaultCodeMessages[messageId] ?? messageTranslation.message,
    }),
  );
}
