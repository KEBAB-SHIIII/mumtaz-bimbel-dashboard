import { healthResponseSchema, type HealthResponse } from '@mumtaz/contracts';
import { apiClient } from '../../lib/api-client';

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<unknown>('/health');
  return healthResponseSchema.parse(data);
}
