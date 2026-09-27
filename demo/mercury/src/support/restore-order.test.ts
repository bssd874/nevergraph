import { describe, expect, it } from "vitest";
import { InvalidOrderTransitionError } from "../domain/errors.js";
import { OrderStatus } from "../domain/order.js";
import {
  cancelOrder,
  createOrder,
  payOrder,
  restoreOrder,
} from "../services/order-service.js";

describe("restoreOrder", () => {
  it("transitions a CANCELLED order back to PAID", () => {
    const order = createOrder();
    payOrder(order);
    cancelOrder(order);

    restoreOrder(order);

    expect(order.status).toBe(OrderStatus.PAID);
  });

  it("rejects restore from a non-CANCELLED state", () => {
    const order = createOrder();
    payOrder(order);

    expect(() => restoreOrder(order)).toThrow(InvalidOrderTransitionError);
    expect(() => restoreOrder(order)).toThrow(/PAID/);
  });
});
