import os
import json
import pickle
from pathlib import Path
from datetime import datetime, timedelta
import re
import requests
from math import radians, sin, cos, asin, sqrt
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import pandas as pd
import numpy as np
from flask import Flask, request, jsonify, redirect
from dotenv import load_dotenv
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
# JWT imports
from flask_jwt_extended import (
    JWTManager, create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt
)

# Google OAuth
from authlib.integrations.flask_client import OAuth

# Requests retry helpers
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Load environment
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
USE_GEMINI = bool(GEMINI_API_KEY)

# Flask app and config
app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-change-me")
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", app.config["SECRET_KEY"])

# JWT Configuration
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=24)
app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=30)
app.config["JWT_TOKEN_LOCATION"] = ["headers"]
app.config["JWT_HEADER_NAME"] = "Authorization"
app.config["JWT_HEADER_TYPE"] = "Bearer"

# Google OAuth Configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"

# Email Configuration
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USERNAME)

BASE_DIR = Path(__file__).parent

# MySQL Database Configuration
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "aihealthbot")
DB_PORT = os.getenv("DB_PORT", "3306")

app.config["SQLALCHEMY_DATABASE_URI"] = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Extensions
db = SQLAlchemy(app)
jwt = JWTManager(app)
oauth = OAuth(app)

# Configure Google OAuth
if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
    google = oauth.register(
        name='google',
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        server_metadata_url=GOOGLE_DISCOVERY_URL,
        client_kwargs={
            'scope': 'openid email profile'
        }
    )
else:
    google = None
    print(" Google OAuth not configured - GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing")

# JWT error handlers
@jwt.unauthorized_loader
def _missing_token(err):
    print(f" Unauthorized: {err}")
    return jsonify({"ok": False, "error": "Missing or invalid access token"}), 401

@jwt.invalid_token_loader
def _invalid_token(err):
    print(f" Invalid token: {err}")
    return jsonify({"ok": False, "error": "Invalid token format"}), 401

@jwt.expired_token_loader
def _expired_token(jwt_header, jwt_payload):
    print(" Token expired")
    return jsonify({"ok": False, "error": "Token expired. Please refresh."}), 401

# Request logging
@app.before_request
def log_request_info():
    if request.path.startswith('/api/'):
        auth = request.headers.get('Authorization', 'None')
        print(f"\n{request.method} {request.path}")
        print(f"   Authorization: {auth[:40]}..." if len(auth) > 40 else f"   Authorization: {auth}")

# CORS configuration
CORS(app, 
     supports_credentials=True,
     origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000", 
              "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:3000"],
     allow_headers=["Content-Type", "Authorization"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])

# Paths
ARTIFACTS_DIR = BASE_DIR / "artifacts"
MODEL_PATH = ARTIFACTS_DIR / "model.pkl"
SYMPTOM_COLUMNS_PATH = ARTIFACTS_DIR / "symptom_columns.json"
DISEASE_INFO_PATH = ARTIFACTS_DIR / "disease_info.json"
DATA_PATH = BASE_DIR / "data" / "merged_dataset.csv"

# DB Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=True)
    email = db.Column(db.String(150), unique=True, nullable=False)
    google_id = db.Column(db.String(255), unique=True, nullable=True)
    password_hash = db.Column(db.String(255), nullable=True)
    role = db.Column(db.String(50), default='user', nullable=False)  # NEW: 'user' or 'admin'
    is_active = db.Column(db.Boolean, default=True, nullable=False)  # NEW: Can deactivate users
    last_login = db.Column(db.DateTime, nullable=True)  # NEW: Track last login
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        if self.password_hash:
            return check_password_hash(self.password_hash, password)
        return False
    
    def is_admin(self) -> bool:
        return self.role == 'admin'

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'is_active': self.is_active,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def to_admin_dict(self):
        """Extended info for admin view"""
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'is_active': self.is_active,
            'google_id': self.google_id,
            'has_password': bool(self.password_hash),
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'prediction_count': Prediction.query.filter_by(user_id=self.id).count()
        }
def create_default_admin():
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")
    admin_username = os.getenv("ADMIN_USERNAME", "admin")

    if not admin_email or not admin_password:
        print("⚠️ ADMIN_EMAIL or ADMIN_PASSWORD not set. Skipping admin creation.")
        return

    admin = User.query.filter_by(email=admin_email).first()

    if admin:
        # Ensure role is admin
        if admin.role != "admin":
            admin.role = "admin"
            db.session.commit()
            print(f"✅ Existing user promoted to admin: {admin_email}")
        else:
            print("ℹ️ Admin already exists.")
        return

    # Create new admin
    admin = User(
        email=admin_email,
        username=admin_username,
        role="admin",
        is_active=True
    )
    admin.set_password(admin_password)

    db.session.add(admin)
    db.session.commit()

    print(f"✅ Default admin created: {admin_email}")


class Prediction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    disease = db.Column(db.String(256))
    specialist = db.Column(db.String(256))
    confidence = db.Column(db.Float)
    selected_symptoms = db.Column(db.Text)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship to user
    user = db.relationship('User', backref=db.backref('predictions', lazy=True))
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'disease': self.disease,
            'specialist': self.specialist,
            'confidence': self.confidence,
            'selected_symptoms': json.loads(self.selected_symptoms or "[]"),
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def to_admin_dict(self):
        """Extended info for admin view with user details"""
        user_info = None
        if self.user:
            user_info = {
                'id': self.user.id,
                'email': self.user.email,
                'username': self.user.username
            }
        
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user': user_info,
            'disease': self.disease,
            'specialist': self.specialist,
            'confidence': self.confidence,
            'selected_symptoms': json.loads(self.selected_symptoms or "[]"),
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


# Add this NEW model for admin activity logs
class AdminLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    admin_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    action = db.Column(db.String(255), nullable=False)  # e.g., "deleted_user", "updated_role"
    target_type = db.Column(db.String(50), nullable=True)  # e.g., "user", "prediction"
    target_id = db.Column(db.Integer, nullable=True)
    details = db.Column(db.Text, nullable=True)  # JSON string with additional details
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    admin = db.relationship('User', backref=db.backref('admin_logs', lazy=True))
    
    def to_dict(self):
        return {
            'id': self.id,
            'admin_id': self.admin_id,
            'admin_email': self.admin.email if self.admin else None,
            'action': self.action,
            'target_type': self.target_type,
            'target_id': self.target_id,
            'details': json.loads(self.details) if self.details else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


# Helper function to log admin actions
def log_admin_action(admin_id: int, action: str, target_type: str = None, 
                     target_id: int = None, details: dict = None):
    """Log admin actions for audit trail"""
    try:
        log = AdminLog(
            admin_id=admin_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=json.dumps(details) if details else None
        )
        db.session.add(log)
        db.session.commit()
        print(f" Admin action logged: {action}")
    except Exception as e:
        print(f" Failed to log admin action: {e}")
        db.session.rollback()
def admin_required(fn):
    """Decorator to require admin role for a route"""
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        try:
            identity_str = get_jwt_identity()
            user_id = int(identity_str)
            
            user = User.query.get(user_id)
            
            if not user:
                return jsonify({"error": "User not found"}), 404
            
            if not user.is_admin():
                print(f" Unauthorized admin access attempt by user {user_id}")
                return jsonify({"error": "Admin access required"}), 403
            
            # Pass user to the route function
            return fn(user, *args, **kwargs)
            
        except ValueError:
            return jsonify({"error": "Invalid token"}), 401
        except Exception as e:
            print(f" Admin auth error: {e}")
            return jsonify({"error": "Authorization failed"}), 500
    
    return wrapper


def active_user_required(fn):
    """Decorator to check if user account is active"""
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        try:
            identity_str = get_jwt_identity()
            user_id = int(identity_str)
            
            user = User.query.get(user_id)
            
            if not user:
                return jsonify({"error": "User not found"}), 404
            
            if not user.is_active:
                return jsonify({"error": "Account is deactivated"}), 403
            
            return fn(*args, **kwargs)
            
        except ValueError:
            return jsonify({"error": "Invalid token"}), 401
        except Exception as e:
            print(f" User auth error: {e}")
            return jsonify({"error": "Authorization failed"}), 500
    
    return wrapper
# Email Helper Function
def send_welcome_email(user_email: str, username: str = None):
    """Send welcome email to newly registered users"""
    try:
        if not SMTP_USERNAME or not SMTP_PASSWORD:
            print(" SMTP credentials not configured, skipping email")
            return False
        
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = ' Welcome to AI HealthBot!'
        msg['From'] = FROM_EMAIL
        msg['To'] = user_email
        
        # Email body
        display_name = username if username else user_email.split('@')[0]
        
        text_content = f"""
Welcome to AI HealthBot!

Hi {display_name},

Thank you for registering with AI HealthBot! 🏥

We're excited to have you on board. With AI HealthBot, you can:
✓ Get AI-powered disease predictions based on your symptoms
✓ Receive specialist recommendations
✓ Track your prediction history
✓ Find nearby healthcare facilities

Start by selecting your symptoms and let our AI help you understand your health better.

Remember: AI HealthBot is a helpful tool, but always consult with healthcare professionals for medical advice.

Stay healthy!
The AI HealthBot Team
        """
        
        html_content = f"""
<html>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
    <div style="max-width: 600px; margin: 0 auto; padding: 0;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 0;">
        <h1 style="color: white; margin: 0; font-size: 32px;">🏥 AI HealthBot</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Your Personal Health Assistant</p>
      </div>
      
      <div style="background: #ffffff; padding: 40px 30px;">
        <h2 style="color: #667eea; margin-top: 0; font-size: 24px;">Welcome aboard, {display_name}! 🎉</h2>
        
        <p style="font-size: 16px; color: #333; line-height: 1.8;">
          Thank you for registering with <strong>AI HealthBot</strong>! We're thrilled to have you join our community.
        </p>
        
        <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; margin: 25px 0;">
          <h3 style="color: #667eea; margin-top: 0; font-size: 18px;">What you can do with AI HealthBot:</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-size: 15px;">✅ Get AI-powered disease predictions based on your symptoms</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-size: 15px;">✅ Receive personalized specialist recommendations</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-size: 15px;">✅ Track your complete prediction history</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-size: 15px;">✅ Find nearby healthcare facilities on the map</td>
            </tr>
          </table>
        </div>
        
        <div style="text-align: center; margin: 35px 0;">
          <a href="http://localhost:5173" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 30px; display: inline-block; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
            Get Started Now →
          </a>
        </div>
        
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin-top: 30px; border-radius: 4px;">
          <p style="margin: 0; font-size: 14px; color: #856404;">
            <strong>⚠️ Important Reminder:</strong><br>
            AI HealthBot is a helpful diagnostic tool designed to provide health insights. However, it should not replace professional medical advice. Always consult with qualified healthcare professionals for accurate diagnosis and treatment.
          </p>
        </div>
        
        <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #e9ecef; text-align: center;">
          <p style="color: #6c757d; font-size: 14px; margin: 5px 0;">
            Need help? Reply to this email or visit our support page.
          </p>
          <p style="color: #6c757d; font-size: 14px; margin: 5px 0;">
            Stay healthy! 💚
          </p>
          <p style="color: #667eea; font-weight: bold; font-size: 15px; margin: 15px 0 0 0;">
            The AI HealthBot Team
          </p>
        </div>
      </div>
      
      <div style="background: #f8f9fa; padding: 20px 30px; text-align: center; border-radius: 0;">
        <p style="color: #6c757d; font-size: 12px; margin: 5px 0;">
          © 2024 AI HealthBot. All rights reserved.
        </p>
        <p style="color: #6c757d; font-size: 12px; margin: 5px 0;">
          This email was sent because you registered for an AI HealthBot account.
        </p>
      </div>
    </div>
  </body>
</html>
        """
        
        # Attach both plain text and HTML versions
        part1 = MIMEText(text_content, 'plain')
        part2 = MIMEText(html_content, 'html')
        msg.attach(part1)
        msg.attach(part2)
        
        # Send email
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
        
        print(f" Welcome email sent to {user_email}")
        return True
        
    except Exception as e:
        print(f" Failed to send email to {user_email}: {e}")
        import traceback
        traceback.print_exc()
        return False

# Load Artifacts
model = None
symptom_columns = []
disease_info = {}
data = pd.DataFrame()

class DummyModel:
    def __init__(self, classes):
        self.classes_ = np.array(classes)

    def predict(self, X):
        results = []
        for x in X:
            s = int(sum(x)) if sum(x) else 0
            idx = s % len(self.classes_)
            results.append(self.classes_[idx])
        return np.array(results)

    def predict_proba(self, X):
        probs = []
        n = len(self.classes_)
        for x in X:
            s = float(sum(x)) if sum(x) else 0.0
            base = np.full(n, 0.05)
            idx = int(s) % n
            base[idx] += 0.9
            base = base / base.sum()
            probs.append(base)
        return np.array(probs)

try:
    if MODEL_PATH.exists():
        with open(MODEL_PATH, "rb") as f:
            model = pickle.load(f)
    if SYMPTOM_COLUMNS_PATH.exists():
        with open(SYMPTOM_COLUMNS_PATH, "r", encoding="utf-8") as f:
            symptom_columns = json.load(f)
    if DISEASE_INFO_PATH.exists():
        with open(DISEASE_INFO_PATH, "r", encoding="utf-8") as f:
            disease_info = json.load(f)
    if DATA_PATH.exists():
        data = pd.read_csv(DATA_PATH)
except Exception as e:
    print("Error loading artifacts:", e)

if not symptom_columns:
    symptom_columns = ["fever", "cough", "headache", "fatigue", "sore_throat"]

if not disease_info:
    disease_info = {
        "common cold": {
            "description": "A mild viral infection.",
            "precautions": ["Rest", "Stay hydrated"]
        }
    }

if model is None:
    model = DummyModel(classes=["Common Cold", "Flu", "Allergy"])

# Disease Specialist Mapping
DISEASE_TO_SPECIALIST = {
    "heart attack": "Cardiologist",
    "myocardial infarction": "Cardiologist",
    "eczema": "Dermatologist",
    "pneumonia": "Pulmonologist",
    "asthma": "Pulmonologist",
    "hepatitis": "Hepatologist",
    "stroke": "Neurologist",
    "migraine": "Neurologist",
    "diabetes": "Endocrinologist",
    "depression": "Psychiatrist",
    "anxiety": "Psychiatrist",
    "default": "General Physician"
}

def normalize_name(name: str) -> str:
    if not name:
        return ""
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9\s/]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s

def get_specialist_local(disease_name: str) -> str:
    default = DISEASE_TO_SPECIALIST.get("default", "General Physician")
    if not disease_name:
        return default
    
    norm = normalize_name(disease_name)
    
    if norm in DISEASE_TO_SPECIALIST:
        return DISEASE_TO_SPECIALIST[norm]
    
    for key in DISEASE_TO_SPECIALIST:
        if key != "default" and (key in norm or norm in key):
            return DISEASE_TO_SPECIALIST[key]
    
    return default

# ==================== API ROUTES ====================

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "message": "API is running"})

@app.route('/api/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '')
        
        if not email or not password:
            return jsonify({"error": "Email and password required"}), 400
        
        if User.query.filter_by(email=email).first():
            return jsonify({"error": "Email already registered"}), 400
        
        if username and User.query.filter_by(username=username).first():
            return jsonify({"error": "Username already exists"}), 400
        
        user = User(username=username or None, email=email)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        
        print(f" User registered: id={user.id}, email={user.email}")
        
        # Send welcome email (non-blocking)
        try:
            send_welcome_email(user.email, user.username)
        except Exception as email_error:
            print(f" Email sending failed but registration successful: {email_error}")
        
        access_token = create_access_token(identity=str(user.id))
        refresh_token = create_refresh_token(identity=str(user.id))
        
        return jsonify({
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": user.to_dict()
        }), 201
        
    except Exception as e:
        print("Register error:", e)
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Registration failed"}), 500

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        password = data.get('password', '')
        
        if not username or not password:
            return jsonify({"error": "Username and password required"}), 400
        
        user = User.query.filter(
            (User.username == username) | (User.email == username)
        ).first()
        
        if not user or not user.check_password(password):
            return jsonify({"error": "Invalid credentials"}), 401
        
        print(f" User logged in: id={user.id}, email={user.email}")
        
        access_token = create_access_token(identity=str(user.id))
        refresh_token = create_refresh_token(identity=str(user.id))
        
        return jsonify({
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": user.to_dict()
        })
        
    except Exception as e:
        print("Login error:", e)
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Login failed"}), 500

# ==================== GOOGLE OAUTH ROUTES ====================

@app.route('/api/auth/google', methods=['GET'])
def google_login():
    """Initiate Google OAuth flow"""
    try:
        if not google:
            return jsonify({"error": "Google OAuth not configured"}), 500
        
        # The callback URL should point to THIS backend
        callback_url = "http://localhost:5000/api/auth/google/callback"
        
        print(f" Starting Google OAuth")
        print(f"   Callback URL: {callback_url}")
        
        return google.authorize_redirect(callback_url)
        
    except Exception as e:
        print(f" Google OAuth error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/auth/google/callback', methods=['GET'])
def google_callback():
    """Handle Google OAuth callback"""
    try:
        print("\n" + "="*60)
        print(" Google callback received")
        
        if not google:
            print(" Google not configured")
            return redirect("http://localhost:5173/login?error=oauth_not_configured")
        
        # Check for errors
        error = request.args.get('error')
        if error:
            print(f" OAuth error: {error}")
            return redirect(f"http://localhost:5173/login?error={error}")
        
        # Get access token from Google
        print(" Getting token from Google...")
        token = google.authorize_access_token()
        print(" Token received from Google")
        
        # Get user info
        print("👤 Getting user info...")
        resp = google.get('https://www.googleapis.com/oauth2/v2/userinfo')
        user_info = resp.json()
        
        google_id = user_info.get('id')
        email = user_info.get('email')
        name = user_info.get('name', '').split()[0] if user_info.get('name') else None
        
        print(f" User email: {email}")
        
        if not google_id or not email:
            print(" Invalid user info")
            return redirect("http://localhost:5173/login?error=invalid_user_info")
        
        # Find or create user
        user = User.query.filter_by(google_id=google_id).first()
        
        if not user:
            user = User.query.filter_by(email=email).first()
            if user:
                user.google_id = google_id
                db.session.commit()
                print(f" Linked Google to existing user")
            else:
                user = User(email=email, username=name, google_id=google_id)
                db.session.add(user)
                db.session.commit()
                print(f" Created new user: {email}")
                
                # Try to send welcome email
                try:
                    send_welcome_email(user.email, user.username)
                except:
                    pass
        else:
            print(f" Existing user: {email}")
        
        # Create JWT tokens
        print(f" Creating JWT for user_id: {user.id}")
        access_token = create_access_token(identity=str(user.id))
        refresh_token = create_refresh_token(identity=str(user.id))
        
        print(f" JWT created")
        print(f"   Token preview: {access_token[:50]}...")
        
        # Build redirect URL WITH the token
        frontend_url = f"http://localhost:5173/auth/google/callback?token={access_token}"
        
        print(f" Redirecting to frontend:")
        print(f"   URL: {frontend_url[:80]}...")
        print(f"   Has token param: {'token=' in frontend_url}")
        print("="*60 + "\n")
        
        return redirect(frontend_url)
        
    except Exception as e:
        print(f" Exception in callback: {e}")
        import traceback
        traceback.print_exc()
        return redirect("http://localhost:5173/login?error=callback_failed")


@app.route('/api/auth/google/verify', methods=['POST'])
def google_verify_token():
    """Verify the token from URL and return fresh tokens"""
    try:
        data = request.get_json()
        token = data.get('token')
        
        if not token:
            print(" No token in verify request")
            return jsonify({"error": "Token required"}), 400
        
        print(f" Verifying token: {token[:50]}...")
        
        # Decode the JWT
        from flask_jwt_extended import decode_token
        decoded = decode_token(token)
        user_id = int(decoded['sub'])
        
        print(f" Token valid for user_id: {user_id}")
        
        # Get user
        user = User.query.get(user_id)
        if not user:
            print(f" User {user_id} not found")
            return jsonify({"error": "User not found"}), 404
        
        # Create fresh tokens
        new_access = create_access_token(identity=str(user.id))
        new_refresh = create_refresh_token(identity=str(user.id))
        
        print(f" Fresh tokens created for {user.email}")
        
        return jsonify({
            "success": True,
            "access_token": new_access,
            "refresh_token": new_refresh,
            "user": user.to_dict()
        }), 200
        
    except Exception as e:
        print(f" Verify error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    try:
        identity_str = get_jwt_identity()
        user_id = int(identity_str)
        
        print(f" Refreshing token for user_id: {user_id}")
        
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
        
        access_token = create_access_token(identity=str(user_id))
        
        print(f" Token refreshed for user_id: {user_id}")
        
        return jsonify({
            "access_token": access_token,
            "user": user.to_dict()
        }), 200
        
    except ValueError as ve:
        print(f" Invalid user_id format: {ve}")
        return jsonify({"error": "Invalid token identity"}), 401
    except Exception as e:
        print(f" Refresh error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Token refresh failed"}), 401

@app.route('/api/user', methods=['GET'])
@jwt_required()
def get_current_user():
    try:
        identity_str = get_jwt_identity()
        user_id = int(identity_str)
        
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({"error": "User not found"}), 404
        
        return jsonify({"user": user.to_dict()})
        
    except ValueError:
        return jsonify({"error": "Invalid token identity"}), 401
    except Exception as e:
        print(f"Error in get_current_user: {e}")
        return jsonify({"error": "Failed to get user"}), 500

@app.route('/api/symptoms', methods=['GET'])
def get_symptoms():
    return jsonify({'symptoms': symptom_columns})

@app.route('/api/history', methods=['GET'])
@jwt_required()
def get_history():
    try:
        identity_str = get_jwt_identity()
        user_id = int(identity_str)
        
        print(f" History request from user_id: {user_id}")
        
        records = (
            Prediction.query
            .filter_by(user_id=user_id)
            .order_by(Prediction.created_at.desc())
            .all()
        )
        
        print(f" Found {len(records)} predictions for user {user_id}")

        history_payload = []
        for rec in records:
            try:
                symptoms = json.loads(rec.selected_symptoms or "[]")
            except Exception as e:
                print(f" Error parsing symptoms for record {rec.id}: {e}")
                symptoms = []
            
            history_payload.append({
                'id': rec.id,
                'disease': rec.disease,
                'specialist': rec.specialist,
                'confidence': rec.confidence,
                'selected_symptoms': symptoms,
                'description': rec.description,
                'created_at': rec.created_at.isoformat() if rec.created_at else None
            })

        return jsonify({
            'ok': True,
            'history': history_payload,
            'count': len(history_payload)
        }), 200
        
    except ValueError as ve:
        print(f" Invalid user_id format: {ve}")
        return jsonify({'error': 'Invalid token identity'}), 401
    except Exception as e:
        print(f' History fetch error: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to fetch history', 'details': str(e)}), 500

@app.route('/api/predict', methods=['POST'])
@jwt_required()
def predict():
    try:
        identity_str = get_jwt_identity()
        user_id = int(identity_str)
        
        print(f"🔍 Prediction from user_id: {user_id}")
        
        data = request.get_json() or {}
        selected_symptoms = data.get('symptoms', [])
        
        if not selected_symptoms:
            return jsonify({'ok': False, 'error': 'Please select at least one symptom'}), 400
        
        input_data = [1 if symptom in selected_symptoms else 0 for symptom in symptom_columns]
        prediction = model.predict([input_data])[0]
        disease_name = str(prediction).strip()
        disease_norm = normalize_name(disease_name)
        
        confidence_value = 0.5
        try:
            if hasattr(model, "predict_proba"):
                probs = model.predict_proba([input_data])[0]
                classes = np.array(getattr(model, "classes_", []), dtype=object)
                match_idx = np.where(classes == prediction)[0]
                if match_idx.size == 0:
                    match_idx = np.where(np.char.lower(classes.astype(str)) == disease_name.lower())[0]
                if match_idx.size:
                    confidence_value = float(probs[int(match_idx[0])])
                else:
                    confidence_value = float(probs.max())
        except Exception as ce:
            print("Confidence error:", ce)
        
        disease_details = None
        for k, v in disease_info.items():
            if normalize_name(k) == disease_norm or k.lower() == disease_name.lower():
                disease_details = v
                break
        
        description = disease_details.get("description", "No description available.") if disease_details else "No description available."
        precautions = disease_details.get("precautions", []) if disease_details else []
        
        specialist = get_specialist_local(disease_name)
        
        try:
            rec = Prediction(
                user_id=user_id,
                disease=disease_name,
                specialist=specialist,
                confidence=float(confidence_value),
                selected_symptoms=json.dumps(selected_symptoms),
                description=description
            )
            db.session.add(rec)
            db.session.commit()
            print(f" Prediction saved (ID: {rec.id}, user_id: {user_id})")
        except Exception as db_err:
            print(f" Failed to save prediction: {db_err}")
            import traceback
            traceback.print_exc()
            db.session.rollback()
            return jsonify({'ok': False, 'error': 'Failed to save prediction'}), 500
        
        return jsonify({
            'ok': True,
            'disease': disease_name,
            'description': description,
            'specialist': specialist,
            'precautions': precautions,
            'confidence': confidence_value,
            'selected_symptoms': selected_symptoms,
            'prediction_id': rec.id
        })
        
    except ValueError as ve:
        print(f" Invalid user_id format: {ve}")
        return jsonify({'ok': False, 'error': 'Invalid token identity'}), 401
    except Exception as e:
        print(" Prediction error:", e)
        import traceback
        traceback.print_exc()
        return jsonify({'ok': False, 'error': str(e)}), 500

# Debug endpoints
@app.route('/api/debug/predictions', methods=['GET'])
def debug_predictions():
    try:
        all_preds = Prediction.query.all()
        return jsonify({
            'total': len(all_preds),
            'predictions': [{
                'id': p.id,
                'user_id': p.user_id,
                'disease': p.disease,
                'created_at': p.created_at.isoformat() if p.created_at else None
            } for p in all_preds]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/debug/check-history', methods=['GET'])
def debug_check_history():
    try:
        all_predictions = Prediction.query.all()
        
        result = {
            'total_predictions': len(all_predictions),
            'predictions_by_user': {}
        }
        
        for pred in all_predictions:
            user_id = pred.user_id or 'None'
            if user_id not in result['predictions_by_user']:
                result['predictions_by_user'][user_id] = []
            
            try:
                symptoms = json.loads(pred.selected_symptoms or "[]")
            except:
                symptoms = []
            
            result['predictions_by_user'][user_id].append({
                'id': pred.id,
                'disease': pred.disease,
                'specialist': pred.specialist,
                'confidence': pred.confidence,
                'symptoms': symptoms,
                'created_at': pred.created_at.isoformat() if pred.created_at else None
            })
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/debug/current-user', methods=['GET'])
@jwt_required()
def debug_current_user():
    try:
        identity_str = get_jwt_identity()
        user_id = int(identity_str)
        
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'user_id': user_id,
            'user': user.to_dict(),
            'predictions_count': Prediction.query.filter_by(user_id=user_id).count()
        }), 200
        
    except ValueError:
        return jsonify({'error': 'Invalid token identity'}), 401
    except Exception as e:
        print(f"Debug error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# Overpass API for Nearby Specialists
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
]

def _requests_session_with_retries(retries=2, backoff_factor=0.6):
    session = requests.Session()
    retry = Retry(
        total=retries,
        read=retries,
        connect=retries,
        backoff_factor=backoff_factor,
        status_forcelist=(429, 502, 503, 504),
        allowed_methods=frozenset(['GET', 'POST'])
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('https://', adapter)
    session.mount('http://', adapter)
    return session

def query_overpass(query_text: str, timeout_seconds: int = 60):
    session = _requests_session_with_retries()
    for url in OVERPASS_ENDPOINTS:
        try:
            resp = session.post(url, data={"data": query_text}, timeout=timeout_seconds)
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            print(f"Overpass error at {url}:", e)
    raise RuntimeError("All Overpass endpoints failed")

def _build_overpass_query(lat: float, lon: float, radius: int, specialist_token: str):
    tok = re.sub(r"[^a-zA-Z0-9\s\-]", " ", (specialist_token or "")).strip()
    tok_esc = tok.replace('"', '\\"')
    q_parts = []
    q_parts.append(f'node(around:{radius},{lat},{lon})[amenity~"hospital|clinic"];')
    q_parts.append(f'way(around:{radius},{lat},{lon})[amenity~"hospital|clinic"];')
    q_parts.append(f'node(around:{radius},{lat},{lon})[healthcare];')
    q_parts.append(f'way(around:{radius},{lat},{lon})[healthcare];')
    if tok_esc:
        q_parts.append(f'node(around:{radius},{lat},{lon})[name~"{tok_esc}",i];')
        q_parts.append(f'way(around:{radius},{lat},{lon})[name~"{tok_esc}",i];')
    
    q = f"""
[out:json][timeout:25];
(
  {chr(10).join(q_parts)}
);
out center;"""
    return q

def _haversine_meters(lat1, lon1, lat2, lon2):
    r = 6371000.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    return r * c
# ==================== ADMIN ROUTES ====================

@app.route('/api/admin/dashboard', methods=['GET'])
@admin_required
def admin_dashboard(admin_user):
    """Get admin dashboard statistics"""
    try:
        total_users = User.query.count()
        active_users = User.query.filter_by(is_active=True).count()
        admin_users = User.query.filter_by(role='admin').count()
        total_predictions = Prediction.query.count()
        
        # Recent registrations (last 30 days)
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        recent_registrations = User.query.filter(User.created_at >= thirty_days_ago).count()
        
        # Recent predictions (last 7 days)
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        recent_predictions = Prediction.query.filter(Prediction.created_at >= seven_days_ago).count()
        
        # Most common diseases
        predictions = Prediction.query.all()
        disease_counts = {}
        for pred in predictions:
            disease = pred.disease
            disease_counts[disease] = disease_counts.get(disease, 0) + 1
        
        top_diseases = sorted(disease_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        
        return jsonify({
            "ok": True,
            "stats": {
                "total_users": total_users,
                "active_users": active_users,
                "admin_users": admin_users,
                "total_predictions": total_predictions,
                "recent_registrations": recent_registrations,
                "recent_predictions": recent_predictions,
                "top_diseases": [{"disease": d[0], "count": d[1]} for d in top_diseases]
            }
        }), 200
        
    except Exception as e:
        print(f"❌ Admin dashboard error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Failed to load dashboard"}), 500


@app.route('/api/admin/users', methods=['GET'])
@admin_required
def admin_get_users(admin_user):
    """Get all users with pagination"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        search = request.args.get('search', '', type=str)
        role_filter = request.args.get('role', None, type=str)
        
        query = User.query
        
        # Search filter
        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                (User.email.like(search_pattern)) | 
                (User.username.like(search_pattern))
            )
        
        # Role filter
        if role_filter:
            query = query.filter_by(role=role_filter)
        
        # Order by created_at descending
        query = query.order_by(User.created_at.desc())
        
        # Paginate
        pagination = query.paginate(page=page, per_page=per_page, error_out=False)
        
        users = [user.to_admin_dict() for user in pagination.items]
        
        return jsonify({
            "ok": True,
            "users": users,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": pagination.total,
                "pages": pagination.pages,
                "has_next": pagination.has_next,
                "has_prev": pagination.has_prev
            }
        }), 200
        
    except Exception as e:
        print(f"❌ Admin get users error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch users"}), 500


@app.route('/api/admin/users/<int:user_id>', methods=['GET'])
@admin_required
def admin_get_user(admin_user, user_id):
    """Get detailed user information"""
    try:
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({"error": "User not found"}), 404
        
        # Get user's predictions
        predictions = Prediction.query.filter_by(user_id=user_id).order_by(
            Prediction.created_at.desc()
        ).limit(10).all()
        
        return jsonify({
            "ok": True,
            "user": user.to_admin_dict(),
            "recent_predictions": [p.to_dict() for p in predictions]
        }), 200
        
    except Exception as e:
        print(f"❌ Admin get user error: {e}")
        return jsonify({"error": "Failed to fetch user"}), 500


@app.route('/api/admin/users/<int:user_id>/role', methods=['PUT'])
@admin_required
def admin_update_user_role(admin_user, user_id):
    """Update user role (admin/user)"""
    try:
        # Prevent self-demotion
        if admin_user.id == user_id:
            return jsonify({"error": "Cannot modify your own role"}), 400
        
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({"error": "User not found"}), 404
        
        data = request.get_json()
        new_role = data.get('role')
        
        if new_role not in ['user', 'admin']:
            return jsonify({"error": "Invalid role. Must be 'user' or 'admin'"}), 400
        
        old_role = user.role
        user.role = new_role
        db.session.commit()
        
        # Log action
        log_admin_action(
            admin_id=admin_user.id,
            action="updated_user_role",
            target_type="user",
            target_id=user_id,
            details={"old_role": old_role, "new_role": new_role}
        )
        
        print(f"✅ Admin {admin_user.id} changed user {user_id} role: {old_role} → {new_role}")
        
        return jsonify({
            "ok": True,
            "message": "User role updated",
            "user": user.to_admin_dict()
        }), 200
        
    except Exception as e:
        print(f"❌ Admin update role error: {e}")
        db.session.rollback()
        return jsonify({"error": "Failed to update role"}), 500


@app.route('/api/admin/users/<int:user_id>/status', methods=['PUT'])
@admin_required
def admin_update_user_status(admin_user, user_id):
    """Activate or deactivate user account"""
    try:
        # Prevent self-deactivation
        if admin_user.id == user_id:
            return jsonify({"error": "Cannot modify your own status"}), 400
        
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({"error": "User not found"}), 404
        
        data = request.get_json()
        is_active = data.get('is_active')
        
        if is_active is None:
            return jsonify({"error": "is_active field is required"}), 400
        
        old_status = user.is_active
        user.is_active = bool(is_active)
        db.session.commit()
        
        # Log action
        action = "activated_user" if is_active else "deactivated_user"
        log_admin_action(
            admin_id=admin_user.id,
            action=action,
            target_type="user",
            target_id=user_id
        )
        
        print(f"✅ Admin {admin_user.id} {'activated' if is_active else 'deactivated'} user {user_id}")
        
        return jsonify({
            "ok": True,
            "message": f"User {'activated' if is_active else 'deactivated'}",
            "user": user.to_admin_dict()
        }), 200
        
    except Exception as e:
        print(f"❌ Admin update status error: {e}")
        db.session.rollback()
        return jsonify({"error": "Failed to update status"}), 500


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@admin_required
def admin_delete_user(admin_user, user_id):
    """Delete a user and all their data"""
    try:
        # Prevent self-deletion
        if admin_user.id == user_id:
            return jsonify({"error": "Cannot delete your own account"}), 400
        
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({"error": "User not found"}), 404
        
        # Store user info for logging
        user_email = user.email
        
        # Delete user's predictions
        Prediction.query.filter_by(user_id=user_id).delete()
        
        # Delete user
        db.session.delete(user)
        db.session.commit()
        
        # Log action
        log_admin_action(
            admin_id=admin_user.id,
            action="deleted_user",
            target_type="user",
            target_id=user_id,
            details={"email": user_email}
        )
        
        print(f"✅ Admin {admin_user.id} deleted user {user_id} ({user_email})")
        
        return jsonify({
            "ok": True,
            "message": "User deleted successfully"
        }), 200
        
    except Exception as e:
        print(f"❌ Admin delete user error: {e}")
        db.session.rollback()
        return jsonify({"error": "Failed to delete user"}), 500


@app.route('/api/admin/predictions', methods=['GET'])
@admin_required
def admin_get_predictions(admin_user):
    """Get all predictions with pagination"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        user_id_filter = request.args.get('user_id', None, type=int)
        
        query = Prediction.query
        
        # User filter
        if user_id_filter:
            query = query.filter_by(user_id=user_id_filter)
        
        # Order by created_at descending
        query = query.order_by(Prediction.created_at.desc())
        
        # Paginate
        pagination = query.paginate(page=page, per_page=per_page, error_out=False)
        
        predictions = [pred.to_admin_dict() for pred in pagination.items]
        
        return jsonify({
            "ok": True,
            "predictions": predictions,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": pagination.total,
                "pages": pagination.pages,
                "has_next": pagination.has_next,
                "has_prev": pagination.has_prev
            }
        }), 200
        
    except Exception as e:
        print(f"❌ Admin get predictions error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch predictions"}), 500


@app.route('/api/admin/predictions/<int:prediction_id>', methods=['DELETE'])
@admin_required
def admin_delete_prediction(admin_user, prediction_id):
    """Delete a specific prediction"""
    try:
        prediction = Prediction.query.get(prediction_id)
        
        if not prediction:
            return jsonify({"error": "Prediction not found"}), 404
        
        # Store info for logging
        user_id = prediction.user_id
        disease = prediction.disease
        
        db.session.delete(prediction)
        db.session.commit()
        
        # Log action
        log_admin_action(
            admin_id=admin_user.id,
            action="deleted_prediction",
            target_type="prediction",
            target_id=prediction_id,
            details={"user_id": user_id, "disease": disease}
        )
        
        print(f"✅ Admin {admin_user.id} deleted prediction {prediction_id}")
        
        return jsonify({
            "ok": True,
            "message": "Prediction deleted successfully"
        }), 200
        
    except Exception as e:
        print(f"❌ Admin delete prediction error: {e}")
        db.session.rollback()
        return jsonify({"error": "Failed to delete prediction"}), 500


@app.route('/api/admin/logs', methods=['GET'])
@admin_required
def admin_get_logs(admin_user):
    """Get admin activity logs"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        
        pagination = AdminLog.query.order_by(
            AdminLog.created_at.desc()
        ).paginate(page=page, per_page=per_page, error_out=False)
        
        logs = [log.to_dict() for log in pagination.items]
        
        return jsonify({
            "ok": True,
            "logs": logs,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": pagination.total,
                "pages": pagination.pages
            }
        }), 200
        
    except Exception as e:
        print(f"❌ Admin get logs error: {e}")
        return jsonify({"error": "Failed to fetch logs"}), 500
@app.route('/api/nearby', methods=['GET'])
def nearby():
    try:
        lat = request.args.get('lat', type=float)
        lng = request.args.get('lng', type=float)
        
        if lat is None or lng is None:
            return jsonify({"ok": False, "error": "lat and lng required"}), 400
        
        radius = request.args.get('radius', default=5000, type=int)
        specialist = request.args.get('specialist', default="", type=str)
        
        q = _build_overpass_query(lat, lng, radius, specialist)
        
        try:
            data = query_overpass(q, timeout_seconds=60)
        except RuntimeError:
            return jsonify({"ok": False, "error": "Service temporarily unavailable"}), 502
        
        elements = data.get("elements", [])
        places = []
        
        for el in elements:
            if el.get("type") == "node":
                plat = el.get("lat")
                plon = el.get("lon")
            else:
                center = el.get("center") or {}
                plat = center.get("lat")
                plon = center.get("lon")
            
            if plat is None or plon is None:
                continue
            
            tags = el.get("tags", {}) or {}
            name = tags.get("name") or tags.get("healthcare") or "Unnamed"
            
            addr_parts = []
            for k in ("addr:housenumber", "addr:street", "addr:city"):
                if tags.get(k):
                    addr_parts.append(tags.get(k))
            address = ", ".join(addr_parts) if addr_parts else ""
            
            places.append({
                "id": el.get("id"),
                "osm_type": el.get("type"),
                "name": name,
                "lat": plat,
                "lng": plon,
                "address": address,
                "tags": tags
            })
        
        places.sort(key=lambda p: _haversine_meters(lat, lng, p["lat"], p["lng"]))
        
        return jsonify({"ok": True, "count": len(places), "places": places})
        
    except Exception as e:
        print("Nearby error:", e)
        return jsonify({"ok": False, "error": str(e)}), 500


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        create_default_admin()

    port = int(os.getenv("PORT", 5000))
    debug_flag = os.getenv("FLASK_ENV", "development") == "development"
    app.run(debug=debug_flag, port=port, host="0.0.0.0")
