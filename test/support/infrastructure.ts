import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

export interface TestInfrastructure {
  mongoUri: string;
  redisUrl: string;
  stop(): Promise<void>;
}

/** Starts throwaway MongoDB (replica set) and Redis containers for integration tests. */
export async function startInfrastructure(): Promise<TestInfrastructure> {
  const [mongo, redis]: [StartedMongoDBContainer, StartedRedisContainer] = await Promise.all([
    new MongoDBContainer('mongo:8.0').start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);
  return {
    mongoUri: `${mongo.getConnectionString()}?directConnection=true`,
    redisUrl: redis.getConnectionUrl(),
    stop: async () => {
      await Promise.all([mongo.stop(), redis.stop()]);
    },
  };
}
