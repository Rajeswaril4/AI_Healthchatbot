import os
import json
import pickle
from pathlib import Path
from datetime import datetime, timedelta
import re
import requests
from math import radians, sin, cos, asin, sqrt
from functools import wraps

import pandas as pd
import numpy as np
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

# JWT imports
from flask_jwt_extended import (
    JWTManager, create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt
)

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
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=1)
app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=30)

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

# CORS configuration for React frontend
CORS(app, 
     supports_credentials=True,
     origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000", 
              "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:3000"],
     allow_headers=["Content-Type", "Authorization"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])

# --- Paths ---
ARTIFACTS_DIR = BASE_DIR / "artifacts"
MODEL_PATH = ARTIFACTS_DIR / "model.pkl"
SYMPTOM_COLUMNS_PATH = ARTIFACTS_DIR / "symptom_columns.json"
DISEASE_INFO_PATH = ARTIFACTS_DIR / "disease_info.json"
DATA_PATH = BASE_DIR / "data" / "merged_dataset.csv"

# --- DB Models ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=True)
    email = db.Column(db.String(150), unique=True, nullable=False)
    google_id = db.Column(db.String(255), unique=True, nullable=True)
    password_hash = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        if self.password_hash:
            return check_password_hash(self.password_hash, password)
        return False

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Prediction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    disease = db.Column(db.String(256))
    specialist = db.Column(db.String(256))  # Added specialist field
    confidence = db.Column(db.Float)
    selected_symptoms = db.Column(db.Text)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


with app.app_context():
    db.create_all()

# --- Load Artifacts ---
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

# --- Disease Specialist Mapping ---
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

# --- API Routes ---

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
        
        print(f"✓ User registered: id={user.id}, email={user.email}")
        
        access_token = create_access_token(identity=user.id)
        refresh_token = create_refresh_token(identity=user.id)
        
        return jsonify({
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": user.to_dict()
        }), 201
        
    except Exception as e:
        print("Register error:", e)
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
        
        print(f"✓ User logged in: id={user.id}, email={user.email}")
        
        access_token = create_access_token(identity=user.id)
        refresh_token = create_refresh_token(identity=user.id)
        
        return jsonify({
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": user.to_dict()
        })
        
    except Exception as e:
        print("Login error:", e)
        return jsonify({"error": "Login failed"}), 500

@app.route('/api/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    identity = get_jwt_identity()
    access_token = create_access_token(identity=identity)
    return jsonify({"access_token": access_token})

@app.route('/api/user', methods=['GET'])
@jwt_required()
def get_current_user():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    return jsonify({"user": user.to_dict()})

@app.route('/api/symptoms', methods=['GET'])
def get_symptoms():
    return jsonify({'symptoms': symptom_columns})

@app.route('/api/history', methods=['GET'])
@jwt_required()
def get_history():
    """Get prediction history for the current user"""
    try:
        # Get user_id from JWT token using flask-jwt-extended
        user_id = get_jwt_identity()
        
        print(f"📋 History request from user_id: {user_id}")
        
        if not user_id:
            print("❌ No user_id in JWT token")
            return jsonify({'error': 'Unauthorized'}), 401

        # Query predictions for this user
        records = (
            Prediction.query
            .filter_by(user_id=user_id)
            .order_by(Prediction.created_at.desc())
            .all()
        )
        
        print(f"✅ Found {len(records)} predictions for user {user_id}")

        # Build response payload
        history_payload = []
        for rec in records:
            try:
                # Parse symptoms JSON
                symptoms = json.loads(rec.selected_symptoms or "[]")
            except Exception as e:
                print(f"⚠️ Error parsing symptoms for record {rec.id}: {e}")
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
        
    except Exception as e:
        print(f'❌ History fetch error: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to fetch history', 'details': str(e)}), 500

# Debug endpoint to check database
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

@app.route('/api/predict', methods=['POST'])
def predict():
    try:
        # Manually extract user_id from Authorization header if present
        user_id = None
        auth_header = request.headers.get('Authorization', '')
        if auth_header and auth_header.startswith('Bearer '):
            try:
                from flask_jwt_extended import decode_token
                token = auth_header.split(' ')[1]
                decoded = decode_token(token)
                user_id = decoded.get('sub')
                print(f"🔐 Prediction request from user_id: {user_id}")
            except Exception as jwt_err:
                print(f"⚠ JWT decode warning (continuing as guest): {jwt_err}")
        
        data = request.get_json()
        selected_symptoms = data.get('symptoms', [])
        
        if not selected_symptoms:
            return jsonify({'ok': False, 'error': 'Please select at least one symptom'}), 400
        
        input_data = [1 if symptom in selected_symptoms else 0 for symptom in symptom_columns]
        prediction = model.predict([input_data])[0]
        disease_name = str(prediction).strip()
        disease_norm = normalize_name(disease_name)
        
        # Calculate confidence
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
        
        # Get disease details
        disease_details = None
        for k, v in disease_info.items():
            if normalize_name(k) == disease_norm or k.lower() == disease_name.lower():
                disease_details = v
                break
        
        description = disease_details.get("description", "No description available.") if disease_details else "No description available."
        precautions = disease_details.get("precautions", []) if disease_details else []
        
        # Get specialist
        specialist = get_specialist_local(disease_name)
        
        # Save prediction with user_id from JWT token
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
            print(f"✓ Prediction saved (ID: {rec.id}, user_id: {user_id})")
        except Exception as db_err:
            print(f"❌ Failed to save prediction: {db_err}")
            db.session.rollback()
        
        return jsonify({
            'ok': True,
            'disease': disease_name,
            'description': description,
            'specialist': specialist,
            'precautions': precautions,
            'confidence': confidence_value,
            'selected_symptoms': selected_symptoms
        })
        
    except Exception as e:
        print("❌ Prediction error:", e)
        import traceback
        traceback.print_exc()
        return jsonify({'ok': False, 'error': str(e)}), 500
# Add this to your app.py to debug
# Run: curl http://localhost:5000/api/debug/check-history

@app.route('/api/debug/check-history', methods=['GET'])
def debug_check_history():
    """Debug endpoint to check all predictions"""
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
    """Debug endpoint to check current user from JWT"""
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'user_id': user_id,
            'user': user.to_dict(),
            'predictions_count': Prediction.query.filter_by(user_id=user_id).count()
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
# --- Overpass API for Nearby Specialists ---
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


if __name__ == '__main__':
    port = int(os.getenv("PORT", 5000))
    debug_flag = os.getenv("FLASK_ENV", "development") == "development"
    app.run(debug=debug_flag, port=port, host="0.0.0.0")