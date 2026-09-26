import { randomUUID } from "node:crypto";
import { Order, OrderStatus } from "../domain/order.js";
import { InvalidOrderTransitionError } from "../domain/errors.js";

export function createOrder(): Order {
  return {
    id: randomUUID(),
    status: OrderStatus.CREATED,
    createdAt: new Date(),
    paidAt: null,
    refundedAt: null,
    cancelledAt: null,
    shippedAt: null,
  };
}

export function payOrder(order: Order): void {
  if (order.status !== OrderStatus.CREATED) {
    throw new InvalidOrderTransitionError(
      order.status,
      OrderStatus.PAID,
      `Only a CREATED order can be paid, but order is ${order.status}`,
    );
  }

  order.status = OrderStatus.PAID;
  order.paidAt = new Date();
}

export function refundOrder(order: Order): void {
  if (order.status !== OrderStatus.PAID) {
    throw new InvalidOrderTransitionError(
      order.status,
      OrderStatus.REFUNDED,
      `Only a PAID order can be refunded, but order is ${order.status}`,
    );
  }

  order.status = OrderStatus.REFUNDED;
  order.refundedAt = new Date();
}

export function cancelOrder(order: Order): void {
  // Shipped orders are terminal — they cannot be cancelled
  if (order.status === OrderStatus.SHIPPED) {
    throw new InvalidOrderTransitionError(
      order.status,
      OrderStatus.CANCELLED,
      `A SHIPPED order cannot be cancelled`,
    );
  }

  if (
    order.status !== OrderStatus.PAID &&
    order.status !== OrderStatus.REFUNDED
  ) {
    throw new InvalidOrderTransitionError(
      order.status,
      OrderStatus.CANCELLED,
      `Cannot cancel an order with status ${order.status}`,
    );
  }

  order.status = OrderStatus.CANCELLED;
  order.cancelledAt = new Date();
}

export function shipOrder(order: Order): void {
  if (order.status !== OrderStatus.PAID) {
    throw new InvalidOrderTransitionError(
      order.status,
      OrderStatus.SHIPPED,
      `Only a PAID order can be shipped, but order is ${order.status}`,
    );
  }

  order.status = OrderStatus.SHIPPED;
  order.shippedAt = new Date();
}
