import { createServerFn } from "@tanstack/react-start";
import {
  stampBeginSchema,
  stampFinishSchema,
  stampViewSchema,
  stampChooseSchema,
  stampPreviewSchema,
  stampScopeInputSchema,
} from "./stamps/validation";
import type { StampIdentityView, StampResult } from "./stamps/types";

const emptyView = (): StampIdentityView => ({
  connected: false,
  address: null,
  proofExpiresAt: null,
  appearance: null,
  holdings: null,
});

export const getStampIdentity = createServerFn({ method: "GET" })
  .validator((data) => stampViewSchema.parse(data))
  .handler(async ({ data }): Promise<StampResult<StampIdentityView>> => {
    const { stampResult } = await import("./stamps/service.server");
    return stampResult(async () => {
      const { stampHttpContext } = await import("./stamps/http.server");
      const context = await stampHttpContext();
      return context ? context.service.view(data.scope, data.page) : emptyView();
    });
  });
export const beginStampProof = createServerFn({ method: "POST" })
  .validator((data) => stampBeginSchema.parse(data))
  .handler(async ({ data }) => {
    const { stampResult } = await import("./stamps/service.server");
    return stampResult(async () => {
      const { stampHttpContext } = await import("./stamps/http.server");
      const context = (await stampHttpContext(true))!;
      const challenge = await context.service.begin(data.scope, data.address);
      context.saveCookie();
      return challenge;
    });
  });
export const finishStampProof = createServerFn({ method: "POST" })
  .validator((data) => stampFinishSchema.parse(data))
  .handler(async ({ data }) => {
    const { stampResult, StampIdentityError } = await import("./stamps/service.server");
    return stampResult(async () => {
      const { stampHttpContext } = await import("./stamps/http.server");
      const context = await stampHttpContext();
      if (!context)
        throw new StampIdentityError("expired", "Request a new wallet proof to continue.");
      return context.service.finish(data);
    });
  });
export const previewStampImage = createServerFn({ method: "POST" })
  .validator((data) => stampPreviewSchema.parse(data))
  .handler(async ({ data }) => {
    const { stampResult, StampIdentityError } = await import("./stamps/service.server");
    return stampResult(async () => {
      const { stampHttpContext } = await import("./stamps/http.server");
      const context = await stampHttpContext();
      if (!context)
        throw new StampIdentityError("expired", "Connect your wallet before choosing a stamp.");
      return context.service.preview(data.scope, data.cpid);
    });
  });
export const chooseStampAppearance = createServerFn({ method: "POST" })
  .validator((data) => stampChooseSchema.parse(data))
  .handler(async ({ data }) => {
    const { stampResult, StampIdentityError } = await import("./stamps/service.server");
    return stampResult(async () => {
      const { stampHttpContext } = await import("./stamps/http.server");
      const context = await stampHttpContext();
      if (!context)
        throw new StampIdentityError("expired", "Connect your wallet before choosing a stamp.");
      return context.service.choose(data.scope, data.cpid, data.mode, data.crop);
    });
  });
export const clearStampAppearance = createServerFn({ method: "POST" })
  .validator((data) => stampScopeInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { stampResult } = await import("./stamps/service.server");
    return stampResult(async () => {
      const { stampHttpContext } = await import("./stamps/http.server");
      const context = await stampHttpContext();
      return context ? context.service.clearAppearance(data.scope) : null;
    });
  });
export const disconnectStampIdentity = createServerFn({ method: "POST" })
  .validator((data) => stampScopeInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { stampResult } = await import("./stamps/service.server");
    return stampResult(async () => {
      const { stampHttpContext } = await import("./stamps/http.server");
      const context = await stampHttpContext();
      return context ? context.service.disconnect(data.scope) : null;
    });
  });
