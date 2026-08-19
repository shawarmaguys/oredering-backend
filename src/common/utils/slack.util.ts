import { Logger } from '@nestjs/common';

const logger = new Logger('SlackUtil');
const channelCache = new Map<string, string>();

export async function resolveChannelId(
  botToken: string,
  channelNameOrId: string,
): Promise<string> {
  const cleanName = channelNameOrId.replace(/^#/, '').trim();

  // If it already looks like a Channel ID (e.g., starts with C, G, D), return it directly
  if (/^[CGD][A-Z0-9]{8,}$/i.test(cleanName)) {
    return cleanName;
  }

  const cacheKey = `${botToken}:${cleanName.toLowerCase()}`;
  if (channelCache.has(cacheKey)) {
    return channelCache.get(cacheKey)!;
  }

  try {
    let cursor: string | undefined = undefined;
    do {
      const url = new URL('https://slack.com/api/conversations.list');
      url.searchParams.append('types', 'public_channel,private_channel');
      url.searchParams.append('limit', '200');
      if (cursor) {
        url.searchParams.append('cursor', cursor);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${botToken}`,
        },
      });

      const result: any = await response.json();
      if (!result.ok) {
        logger.error(`conversations.list failed: ${result.error}`);
        break;
      }

      const channels = result.channels || [];
      for (const c of channels) {
        if (c.name && c.id) {
          channelCache.set(`${botToken}:${c.name.toLowerCase()}`, c.id);
        }
      }

      const found = channels.find(
        (c: any) => c.name.toLowerCase() === cleanName.toLowerCase(),
      );
      if (found) {
        channelCache.set(cacheKey, found.id);
        return found.id;
      }

      cursor = result.response_metadata?.next_cursor;
    } while (cursor);
  } catch (err: any) {
    logger.error(`Error in resolveChannelId for "${cleanName}": ${err?.message || err}`, err?.stack);
  }

  // Fallback to original value
  return channelNameOrId;
}

export async function uploadPdfToSlackThread(
  botToken: string,
  channelId: string,
  threadTs: string | null | undefined,
  pdfBuffer: Buffer,
  fileName: string,
  message?: string,
): Promise<any> {
  const urlEncodedBody = new URLSearchParams();
  urlEncodedBody.append('filename', fileName);
  urlEncodedBody.append('length', pdfBuffer.length.toString());

  const getUrlResponse = await fetch(
    'https://slack.com/api/files.getUploadURLExternal',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: urlEncodedBody.toString(),
    },
  );

  const getUrlResult: any = await getUrlResponse.json();
  if (!getUrlResult.ok) {
    throw new Error(`getUploadURLExternal failed: ${getUrlResult.error}`);
  }

  const { upload_url, file_id } = getUrlResult;

  const uploadFileResponse = await fetch(upload_url, {
    method: 'POST',
    body: new Uint8Array(pdfBuffer),
  });

  if (!uploadFileResponse.ok) {
    throw new Error(
      `Binary upload failed with status: ${uploadFileResponse.status}`,
    );
  }

  const completePayload: any = {
    files: [{ id: file_id, title: fileName }],
    channel_id: channelId,
  };
  if (threadTs) {
    completePayload.thread_ts = threadTs;
  }
  if (message) {
    completePayload.initial_comment = message;
  }

  const completeResponse = await fetch(
    'https://slack.com/api/files.completeUploadExternal',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(completePayload),
    },
  );

  const completeResult: any = await completeResponse.json();
  if (!completeResult.ok) {
    throw new Error(`completeUploadExternal failed: ${completeResult.error}`);
  }

  return completeResult;
}
