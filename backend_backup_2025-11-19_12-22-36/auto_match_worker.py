# auto_match_worker.py
import argparse
import os
import sys

from database import SessionLocal
from models import Order as OrderModel, Transport as TransportModel
from notifications import (
    find_and_notify_auto_match_for_order,
    find_and_notify_auto_match_for_transport,
)
from main import dbg_mem  # чтобы писать в тот же mem.log


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=["order", "transport"], required=True)
    parser.add_argument("--id", required=True)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.kind == "order":
            order_id = int(args.id)
            order = db.query(OrderModel).get(order_id)
            if not order:
                print(f"[AUTO_MATCH_WORKER] order {order_id} not found")
                return
            dbg_mem(f"worker(order {order_id}): before auto_match")
            find_and_notify_auto_match_for_order(order, db)
            dbg_mem(f"worker(order {order_id}): after auto_match")

        elif args.kind == "transport":
            transport_id = args.id
            transport = db.query(TransportModel).get(transport_id)
            if not transport:
                print(f"[AUTO_MATCH_WORKER] transport {transport_id} not found")
                return
            dbg_mem(f"worker(transport {transport_id}): before auto_match")
            find_and_notify_auto_match_for_transport(transport, db)
            dbg_mem(f"worker(transport {transport_id}): after auto_match")

    finally:
        db.close()


if __name__ == "__main__":
    main()
