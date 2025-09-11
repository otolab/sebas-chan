import { Input, PondEntry } from '@sebas-chan/shared-types';
import { DBClient } from '@sebas-chan/db';
import { nanoid } from 'nanoid';

export interface IngestInputPayload {
  input: Omit<Input, 'id' | 'timestamp'>;
}

export async function ingestInput(
  payload: IngestInputPayload,
  dbClient: DBClient
): Promise<{ success: boolean; pondEntryId?: string; error?: string }> {
  try {
    // Inputデータを整形
    const input: Input = {
      id: nanoid(),
      ...payload.input,
      timestamp: new Date(),
    };

    // PondEntryを作成
    const pondEntry = {
      id: input.id,
      content: input.content,
      source: input.source,
      timestamp: input.timestamp,
    };

    // DBに保存
    const success = await dbClient.addPondEntry(pondEntry);

    if (success) {
      console.log(`Input ingested to Pond: ${pondEntry.id}`);
      return { success: true, pondEntryId: pondEntry.id };
    } else {
      return { success: false, error: 'Failed to save to database' };
    }
  } catch (error) {
    console.error('Error ingesting input:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}