import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

export interface TestInfrastructure {
  mongoUri: string;
  redisUrl: string;
  stop(): Promise<void>;
}

/**
 * Starts throwaway MongoDB (replica set) and Redis containers for integration tests.
 * Without Docker, point TEST_MONGO_URI and TEST_REDIS_URL at servers you can wipe instead:
 * tests write to them and are not cleaned up.
 */
export async function startInfrastructure(): Promise<TestInfrastructure> {
  const { TEST_MONGO_URI, TEST_REDIS_URL } = process.env;
  if (TEST_MONGO_URI && TEST_REDIS_URL) {
    return { mongoUri: TEST_MONGO_URI, redisUrl: TEST_REDIS_URL, stop: () => Promise.resolve() };
  }

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
