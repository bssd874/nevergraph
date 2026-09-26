export enum OrderStatus {
  CREATED = "CREATED",
  PAID = "PAID",
  REFUNDED = "REFUNDED",
  CANCELLED = "CANCELLED",
  SHIPPED = "SHIPPED",
}

export interface Order {
  id: string;
  status: OrderStatus;
  createdAt: Date;
  paidAt: Date | null;
  refundedAt: Date | null;
  cancelledAt: Date | null;
  shippedAt: Date | null;
}
