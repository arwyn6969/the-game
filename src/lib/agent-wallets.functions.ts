import { createMiddleware, createServerFn } from "@tanstack/react-start";
import {
  beginReceivingSchema,
  finishReceivingSchema,
  ownerRequestSchema,
  receivingInventorySchema,
  retireReceivingSchema,
  sourceWorldSchema,
  worldRegistrationSchema,
} from "./agent-wallets/validation";

// Preserve the existing preview bearer transport. The server independently
// verifies the token. The expected reference only rejects stale account context;
// it never supplies ownership authority.
const ownerTransport = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { getBearerToken } = await import("./auth/client");
    return next({ sendContext: { ownerBearer: getBearerToken() ?? undefined } });
  })
  .server(async ({ next, context }) =>
    next({
      context: {
        ownerBearer: typeof context.ownerBearer === "string" ? context.ownerBearer : undefined,
      },
    }),
  );

export const getAgentOwnerAccess = createServerFn({ method: "GET" })
  .middleware([ownerTransport])
  .handler(async ({ context }) => {
    const { registryResult } = await import("./agent-wallets/service.server");
    return registryResult(async () => {
      const { agentOwnerAccess } = await import("./agent-wallets/http.server");
      return agentOwnerAccess(context.ownerBearer);
    });
  });
export const findAgentWorld = createServerFn({ method: "GET" })
  .middleware([ownerTransport])
  .validator((data) => ownerRequestSchema(sourceWorldSchema).parse(data))
  .handler(async ({ data, context }) => {
    const { registryResult } = await import("./agent-wallets/service.server");
    return registryResult(async () => {
      const { agentRegistryContext } = await import("./agent-wallets/http.server");
      return (await agentRegistryContext(data.expectedOwnerRef, context.ownerBearer)).find(
        data.input.sourceWorldId,
      );
    });
  });
export const registerAgentWorld = createServerFn({ method: "POST" })
  .middleware([ownerTransport])
  .validator((data) => ownerRequestSchema(worldRegistrationSchema).parse(data))
  .handler(async ({ data, context }) => {
    const { registryResult } = await import("./agent-wallets/service.server");
    return registryResult(async () => {
      const { agentRegistryContext } = await import("./agent-wallets/http.server");
      return (await agentRegistryContext(data.expectedOwnerRef, context.ownerBearer)).register(
        data.input,
      );
    });
  });
export const beginAgentReceivingProof = createServerFn({ method: "POST" })
  .middleware([ownerTransport])
  .validator((data) => ownerRequestSchema(beginReceivingSchema).parse(data))
  .handler(async ({ data, context }) => {
    const { registryResult } = await import("./agent-wallets/service.server");
    return registryResult(async () => {
      const { agentRegistryContext } = await import("./agent-wallets/http.server");
      return (await agentRegistryContext(data.expectedOwnerRef, context.ownerBearer)).begin(
        data.input,
      );
    });
  });
export const finishAgentReceivingProof = createServerFn({ method: "POST" })
  .middleware([ownerTransport])
  .validator((data) => ownerRequestSchema(finishReceivingSchema).parse(data))
  .handler(async ({ data, context }) => {
    const { registryResult } = await import("./agent-wallets/service.server");
    return registryResult(async () => {
      const { agentRegistryContext } = await import("./agent-wallets/http.server");
      return (await agentRegistryContext(data.expectedOwnerRef, context.ownerBearer)).finish(
        data.input,
      );
    });
  });
export const retireAgentReceivingProfile = createServerFn({ method: "POST" })
  .middleware([ownerTransport])
  .validator((data) => ownerRequestSchema(retireReceivingSchema).parse(data))
  .handler(async ({ data, context }) => {
    const { registryResult } = await import("./agent-wallets/service.server");
    return registryResult(async () => {
      const { agentRegistryContext } = await import("./agent-wallets/http.server");
      return (await agentRegistryContext(data.expectedOwnerRef, context.ownerBearer)).retire(
        data.input,
      );
    });
  });
export const getAgentReceivingInventory = createServerFn({ method: "GET" })
  .middleware([ownerTransport])
  .validator((data) => ownerRequestSchema(receivingInventorySchema).parse(data))
  .handler(async ({ data, context }) => {
    const { registryResult } = await import("./agent-wallets/service.server");
    return registryResult(async () => {
      const { agentRegistryContext } = await import("./agent-wallets/http.server");
      return (await agentRegistryContext(data.expectedOwnerRef, context.ownerBearer)).inventory(
        data.input,
      );
    });
  });
