import sys
from database import SessionLocal
from models import User as UserModel, UserRole

def main():
    if len(sys.argv) < 2:
        print("Usage: python tools/promote_admin.py <email>"); return
    email = sys.argv[1]
    db = SessionLocal()
    try:
        u = db.query(UserModel).filter(UserModel.email == email).first()
        if not u: 
            print("User not found"); return
        u.role = UserRole.ADMIN
        db.add(u); db.commit()
        print(f"OK: {email} -> ADMIN")
    finally:
        db.close()

if __name__ == "__main__":
    main()
