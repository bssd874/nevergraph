import { describe, it, expect } from "vitest";
import { Order, OrderStatus } from "../domain/order.js";
import { InvalidOrderTransitionError } from "../domain/errors.js";
import {
  createOrder,
  payOrder,
  refundOrder,
  cancelOrder,
  shipOrder,
} from "../services/order-service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newCreatedOrder(): Order {
  return createOrder();
}

function newPaidOrder(): Order {
  const order = createOrder();
  payOrder(order);
  return order;
}

function newRefundedOrder(): Order {
  const order = newPaidOrder();
  refundOrder(order);
  return order;
}

function newCancelledFromPaidOrder(): Order {
  const order = newPaidOrder();
  cancelOrder(order);
  return order;
}

function newShippedOrder(): Order {
  const order = newPaidOrder();
  shipOrder(order);
  return order;
}

// ---------------------------------------------------------------------------
// createOrder
// ---------------------------------------------------------------------------

describe("createOrder", () => {
  it("creates an order with CREATED status", () => {
    const order = createOrder();
    expect(order.status).toBe(OrderStatus.CREATED);
  });

  it("sets createdAt to a Date", () => {
    const before = new Date();
    const order = createOrder();
    const after = new Date();
    expect(order.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(order.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("initialises all lifecycle timestamps to null", () => {
    const order = createOrder();
    expect(order.paidAt).toBeNull();
    expect(order.refundedAt).toBeNull();
    expect(order.cancelledAt).toBeNull();
    expect(order.shippedAt).toBeNull();
  });

  it("assigns a unique id", () => {
    const a = createOrder();
    const b = createOrder();
    expect(a.id).not.toBe(b.id);
  });
});

// ---------------------------------------------------------------------------
// payOrder
// ---------------------------------------------------------------------------

describe("payOrder", () => {
  it("transitions CREATED -> PAID", () => {
    const order = newCreatedOrder();
    payOrder(order);
    expect(order.status).toBe(OrderStatus.PAID);
  });

  it("records paidAt", () => {
    const order = newCreatedOrder();
    const before = new Date();
    payOrder(order);
    const after = new Date();
    expect(order.paidAt).not.toBeNull();
    expect(order.paidAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(order.paidAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("rejects payment of a REFUNDED order", () => {
    const order = newRefundedOrder();
    expect(() => payOrder(order)).toThrow(InvalidOrderTransitionError);
    expect(() => payOrder(order)).toThrow(/REFUNDED/);
  });

  it("rejects payment of a CANCELLED order", () => {
    const order = newCancelledFromPaidOrder();
    expect(() => payOrder(order)).toThrow(InvalidOrderTransitionError);
  });

  it("rejects payment of a SHIPPED order", () => {
    const order = newShippedOrder();
    expect(() => payOrder(order)).toThrow(InvalidOrderTransitionError);
  });

  it("rejects payment of a PAID order", () => {
    const order = newPaidOrder();
    expect(() => payOrder(order)).toThrow(InvalidOrderTransitionError);
  });
});

// ---------------------------------------------------------------------------
// refundOrder
// ---------------------------------------------------------------------------

describe("refundOrder", () => {
  it("transitions PAID -> REFUNDED", () => {
    const order = newPaidOrder();
    refundOrder(order);
    expect(order.status).toBe(OrderStatus.REFUNDED);
  });

  it("records refundedAt", () => {
    const order = newPaidOrder();
    const before = new Date();
    refundOrder(order);
    const after = new Date();
    expect(order.refundedAt).not.toBeNull();
    expect(order.refundedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(order.refundedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("preserves paidAt after refund", () => {
    const order = newPaidOrder();
    const paidAt = order.paidAt;
    refundOrder(order);
    expect(order.paidAt).toBe(paidAt);
  });

  it("rejects refund of a CREATED order", () => {
    const order = newCreatedOrder();
    expect(() => refundOrder(order)).toThrow(InvalidOrderTransitionError);
  });

  it("rejects refund of a CANCELLED order", () => {
    const order = newCancelledFromPaidOrder();
    expect(() => refundOrder(order)).toThrow(InvalidOrderTransitionError);
  });

  it("rejects refund of a SHIPPED order", () => {
    const order = newShippedOrder();
    expect(() => refundOrder(order)).toThrow(InvalidOrderTransitionError);
  });
});

// ---------------------------------------------------------------------------
// cancelOrder
// ---------------------------------------------------------------------------

describe("cancelOrder", () => {
  it("transitions PAID -> CANCELLED", () => {
    const order = newPaidOrder();
    cancelOrder(order);
    expect(order.status).toBe(OrderStatus.CANCELLED);
  });

  it("records cancelledAt when cancelling from PAID", () => {
    const order = newPaidOrder();
    const before = new Date();
    cancelOrder(order);
    const after = new Date();
    expect(order.cancelledAt).not.toBeNull();
    expect(order.cancelledAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(order.cancelledAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("transitions REFUNDED -> CANCELLED", () => {
    const order = newRefundedOrder();
    cancelOrder(order);
    expect(order.status).toBe(OrderStatus.CANCELLED);
  });

  it("records cancelledAt when cancelling from REFUNDED", () => {
    const order = newRefundedOrder();
    cancelOrder(order);
    expect(order.cancelledAt).not.toBeNull();
  });

  it("preserves refundedAt when cancelling a refunded order", () => {
    const order = newRefundedOrder();
    const refundedAt = order.refundedAt;
    cancelOrder(order);
    expect(order.refundedAt).toBe(refundedAt);
    expect(order.refundedAt).not.toBeNull();
  });

  it("preserves paidAt when cancelling a refunded order", () => {
    const order = newRefundedOrder();
    const paidAt = order.paidAt;
    cancelOrder(order);
    expect(order.paidAt).toBe(paidAt);
  });

  it("rejects cancellation of a SHIPPED order", () => {
    const order = newShippedOrder();
    expect(() => cancelOrder(order)).toThrow(InvalidOrderTransitionError);
    expect(() => cancelOrder(order)).toThrow(/SHIPPED/);
  });

  it("rejects cancellation of a CREATED order", () => {
    const order = newCreatedOrder();
    expect(() => cancelOrder(order)).toThrow(InvalidOrderTransitionError);
  });

  it("rejects cancellation of an already CANCELLED order", () => {
    const order = newCancelledFromPaidOrder();
    expect(() => cancelOrder(order)).toThrow(InvalidOrderTransitionError);
  });
});

// ---------------------------------------------------------------------------
// shipOrder
// ---------------------------------------------------------------------------

describe("shipOrder", () => {
  it("transitions PAID -> SHIPPED", () => {
    const order = newPaidOrder();
    shipOrder(order);
    expect(order.status).toBe(OrderStatus.SHIPPED);
  });

  it("records shippedAt", () => {
    const order = newPaidOrder();
    const before = new Date();
    shipOrder(order);
    const after = new Date();
    expect(order.shippedAt).not.toBeNull();
    expect(order.shippedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(order.shippedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("rejects shipment of a CREATED order", () => {
    const order = newCreatedOrder();
    expect(() => shipOrder(order)).toThrow(InvalidOrderTransitionError);
    expect(() => shipOrder(order)).toThrow(/CREATED/);
  });

  it("rejects shipment of a CANCELLED order", () => {
    const order = newCancelledFromPaidOrder();
    expect(() => shipOrder(order)).toThrow(InvalidOrderTransitionError);
    expect(() => shipOrder(order)).toThrow(/CANCELLED/);
  });

  it("rejects shipment of a REFUNDED order", () => {
    const order = newRefundedOrder();
    expect(() => shipOrder(order)).toThrow(InvalidOrderTransitionError);
    expect(() => shipOrder(order)).toThrow(/REFUNDED/);
  });

  it("rejects shipment of an already SHIPPED order", () => {
    const order = newShippedOrder();
    expect(() => shipOrder(order)).toThrow(InvalidOrderTransitionError);
  });
});

// ---------------------------------------------------------------------------
// Historical fact preservation (critical for future context-aware analysis)
// ---------------------------------------------------------------------------

describe("historical fact preservation", () => {
  it("refund -> cancel preserves refundedAt (non-null)", () => {
    const order = newPaidOrder();
    refundOrder(order);
    const refundedAt = order.refundedAt;
    cancelOrder(order);
    expect(order.refundedAt).toBe(refundedAt);
    expect(order.refundedAt).not.toBeNull();
  });

  it("refund -> cancel preserves paidAt (non-null)", () => {
    const order = newPaidOrder();
    const paidAt = order.paidAt;
    refundOrder(order);
    cancelOrder(order);
    expect(order.paidAt).toBe(paidAt);
    expect(order.paidAt).not.toBeNull();
  });

  it("pay -> refund preserves paidAt unchanged", () => {
    const order = newCreatedOrder();
    payOrder(order);
    const paidAt = order.paidAt;
    refundOrder(order);
    expect(order.paidAt).toBe(paidAt);
  });
});
