import { createMiddleware, createServerFn } from "@tanstack/react-start";
import {
  beginReceivingSchema,
  finishReceivingSchema,
  ownerRequestSchema,
  receivingInventorySchema,
  receivingObservationsSchema,
  retireReceivingSchema,
  sourceWorldSchema,
  worldRegistrationSchema,
} from "./agent-wallets/validation";

// Preview credentials belong in a header: TanStack serializes sendContext into
// GET URLs. The server verifies the actual request's cookie/bearer independently.
// The expected reference only rejects stale account context, never grants access.
const ownerTransport = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { getBearerToken } = await import("./auth/client");
  const token = getBearerToken();
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});

export const getAgentOwnerAccess = createServerFn({ method: "GET" })
  .middleware([ownerTransport])
  .handler(async () => {
    const { registryResult } = await import("./agent-wallets/service.server");
    return registryResult(async () => {
      const { agentOwnerAccess } = await import("./agent-wallets/http.server");
      return agentOwnerAccess();
    });
  });
export const findAgentWorld = createServerFn({ method: "GET" })
  .middleware([ownerTransport])
  .validator((data) => ownerRequestSchema(sourceWorldSchema).parse(data))
  .handler(async ({ data }) => {
    const { registryResult } = await import("./agent-wallets/service.server");
    return registryResult(async () => {
      const { agentRegistryContext } = await import("./agent-wallets/http.server");
      return (await agentRegistryContext(data.expectedOwnerRef)).find(data.input.sourceWorldId);
    });
  });
export const registerAgentWorld = createServerFn({ method: "POST" })
  .middleware([ownerTransport])
  .validator((data) => ownerRequestSchema(worldRegistrationSchema).parse(data))
  .handler(async ({ data }) => {
    const { registryResult } = await import("./agent-wallets/service.server");
    return registryResult(async () => {
      const { agentRegistryContext } = await import("./agent-wallets/http.server");
      return (await agentRegistryContext(data.expectedOwnerRef)).register(data.input);
    });
  });
export const beginAgentReceivingProof = createServerFn({ method: "POST" })
  .middleware([ownerTransport])
  .validator((data) => ownerRequestSchema(beginReceivingSchema).parse(data))
  .handler(async ({ data }) => {
    const { registryResult } = await import("./agent-wallets/service.server");
    return registryResult(async () => {
      const { agentRegistryContext } = await import("./agent-wallets/http.server");
      return (await agentRegistryContext(data.expectedOwnerRef)).begin(data.input);
    });
  });
export const finishAgentReceivingProof = createServerFn({ method: "POST" })
  .middleware([ownerTransport])
  .validator((data) => ownerRequestSchema(finishReceivingSchema).parse(data))
  .handler(async ({ data }) => {
    const { registryResult } = await import("./agent-wallets/service.server");
    return registryResult(async () => {
      const { agentRegistryContext } = await import("./agent-wallets/http.server");
      return (await agentRegistryContext(data.expectedOwnerRef)).finish(data.input);
    });
  });
export const retireAgentReceivingProfile = createServerFn({ method: "POST" })
  .middleware([ownerTransport])
  .validator((data) => ownerRequestSchema(retireReceivingSchema).parse(data))
  .handler(async ({ data }) => {
    const { registryResult } = await import("./agent-wallets/service.server");
    return registryResult(async () => {
      const { agentRegistryContext } = await import("./agent-wallets/http.server");
      return (await agentRegistryContext(data.expectedOwnerRef)).retire(data.input);
    });
  });
export const getAgentReceivingInventory = createServerFn({ method: "GET" })
  .middleware([ownerTransport])
  .validator((data) => ownerRequestSchema(receivingInventorySchema).parse(data))
  .handler(async ({ data }) => {
    const { registryResult } = await import("./agent-wallets/service.server");
    return registryResult(async () => {
      const { agentRegistryContext } = await import("./agent-wallets/http.server");
      return (await agentRegistryContext(data.expectedOwnerRef)).inventory(data.input);
    });
  });

export const getAgentReceivingObservations = createServerFn({ method: "GET" })
  .middleware([ownerTransport])
  .validator((data) => ownerRequestSchema(receivingObservationsSchema).parse(data))
  .handler(async ({ data }) => {
    const { registryResult } = await import("./agent-wallets/service.server");
    return registryResult(async () => {
      const { agentObservationContext } = await import("./agent-wallets/http.server");
      return (await agentObservationContext(data.expectedOwnerRef)).load(data.input);
    });
  });
export const refreshAgentReceivingObservations = createServerFn({ method: "POST" })
  .middleware([ownerTransport])
  .validator((data) => ownerRequestSchema(receivingObservationsSchema).parse(data))
  .handler(async ({ data }) => {
    const { registryResult } = await import("./agent-wallets/service.server");
    return registryResult(async () => {
      const { agentObservationContext } = await import("./agent-wallets/http.server");
      return (await agentObservationContext(data.expectedOwnerRef)).refresh(data.input);
    });
  });
