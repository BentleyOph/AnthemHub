import Redis from "ioredis";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL must be set");
  }

  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
  });

  redisClient.on("error", (error) => {
    console.error("Redis connection error", error);
  });

  return redisClient;
}

export function closeRedisClient(): void {
  if (redisClient) {
    redisClient.disconnect(false);
    redisClient = null;
  }
}
