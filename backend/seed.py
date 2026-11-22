"""Create the users table and add the default user (safe to run more than once)."""
import bcrypt

from database import Base, SessionLocal, engine
from models import User

USERNAME = "shiva"
PASSWORD = "infinite"

Base.metadata.create_all(engine)

with SessionLocal() as db:
    if db.query(User).filter_by(username=USERNAME).first():
        print(f"User '{USERNAME}' already exists")
    else:
        hashed = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt()).decode()
        db.add(User(username=USERNAME, password_hash=hashed))
        db.commit()
        print(f"Created user '{USERNAME}'")
