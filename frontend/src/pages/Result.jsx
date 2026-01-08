import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import '../styles/Result.css';

// Fix Leaflet default marker icon issue
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const Result = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { api } = useAuth();
  
  const [predictionData, setPredictionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [showMap, setShowMap] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [loadingNearby, setLoadingNearby] = useState(false);

  useEffect(() => {
    if (location.state?.prediction) {
      setPredictionData(location.state.prediction);
      setLoading(false);
    } else if (location.state?.result) {
      // Support both 'prediction' and 'result' keys for backwards compatibility
      setPredictionData(location.state.result);
      setLoading(false);
    } else {
      navigate('/', { replace: true });
    }
  }, [location, navigate]);

  const formatSymptomName = (symptom) => {
    return symptom
      .replace(/_/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatConfidence = (confidence) => {
    if (!confidence) return null;
    const value = confidence <= 1 ? confidence * 100 : confidence;
    return value.toFixed(1);
  };

  const handleFindNearby = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setLoadingNearby(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });

        try {
          const specialist = predictionData?.specialist || 'hospital';
          const response = await api.get('/nearby', {
            params: {
              lat: latitude,
              lng: longitude,
              radius: 5000,
              specialist: specialist
            }
          });

          if (response.data.ok) {
            setNearbyPlaces(response.data.places || []);
            setShowMap(true);
          } else {
            alert(response.data.error || 'Failed to find nearby specialists');
          }
        } catch (error) {
          console.error('Error fetching nearby places:', error);
          alert('Failed to find nearby specialists. Please try again.');
        } finally {
          setLoadingNearby(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert('Unable to get your location. Please enable location services.');
        setLoadingNearby(false);
      }
    );
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="result-container">
        <div className="loading-spinner">Loading results...</div>
      </div>
    );
  }

  if (!predictionData) {
    return null;
  }

  const { 
    disease, 
    description, 
    precautions, 
    selected_symptoms,
    specialist,
    confidence,
    conf_num 
  } = predictionData;

  const confidencePercent = formatConfidence(confidence || conf_num);

  return (
    <div className="result-container">
      <div className="result-card">
        <h1 className="disease-name">{disease || 'Unknown'}</h1>

        <div className="meta-row">
          {specialist && (
            <div className="meta-item">
              <div className="section-title">
                <span>👨‍⚕️</span>
                Recommended Specialist
              </div>
              <p className="specialist">{specialist}</p>
            </div>
          )}

          {confidencePercent && (
            <div className="meta-item">
              <div className="section-title">
                <span>📊</span>
                Confidence Level
              </div>
              <p className="confidence-text">{confidencePercent}%</p>
              <div className="confidence-meter">
                <div 
                  className="confidence-fill" 
                  style={{ width: `${confidencePercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {selected_symptoms && selected_symptoms.length > 0 && (
          <div className="section">
            <h3 className="section-title">
              <span>🔍</span>
              Selected Symptoms
            </h3>
            <div className="selected-symptoms">
              {selected_symptoms.map((symptom, index) => (
                <span key={index} className="selected-symptom">
                  {formatSymptomName(symptom)}
                </span>
              ))}
            </div>
          </div>
        )}

        {description && (
          <div className="section">
            <h3 className="section-title">
              <span>📋</span>
              Description
            </h3>
            <p className="description">{description}</p>
          </div>
        )}

        {precautions && precautions.length > 0 && (
          <div className="section">
            <h3 className="section-title">
              <span>⚕️</span>
              Recommended Precautions
            </h3>
            <ul className="precautions">
              {precautions.map((precaution, index) => (
                <li key={index}>{precaution}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="section">
          <p className="text-muted" style={{ fontSize: '0.9rem', fontStyle: 'italic' }}>
            ⚠️ <strong>Disclaimer:</strong> This is an AI-based prediction and should not be considered 
            as a professional medical diagnosis. Please consult with a healthcare professional for proper 
            medical advice and treatment.
          </p>
        </div>

        <div className="actions">
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/')}
          >
            ← New Prediction
          </button>
          <button 
            className="btn btn-outline"
            onClick={() => navigate('/history')}
          >
            📜 View History
          </button>
          <button 
            className="btn btn-outline"
            onClick={handlePrint}
          >
            🖨️ Print
          </button>
        </div>

        {/* Nearby Specialists Section */}
        <div className="nearby-section">
          <h3 className="section-title">
            <span>📍</span>
            Find Nearby Specialists
          </h3>
          
          <div className="nearby-actions">
            <button
              className="btn btn-primary"
              onClick={handleFindNearby}
              disabled={loadingNearby}
            >
              {loadingNearby ? 'Finding...' : '🔍 Find Nearby'}
            </button>
            
            {showMap && nearbyPlaces.length > 0 && (
              <button
                className="btn btn-outline"
                onClick={() => setShowMap(!showMap)}
              >
                {showMap ? 'Hide Map' : 'Show Map'}
              </button>
            )}
          </div>

          {showMap && userLocation && (
            <div className="map-container">
              <MapContainer
                center={[userLocation.lat, userLocation.lng]}
                zoom={13}
                style={{ height: '400px', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                
                {/* User location marker */}
                <Marker position={[userLocation.lat, userLocation.lng]}>
                  <Popup>Your Location</Popup>
                </Marker>

                {/* Nearby places markers */}
                {nearbyPlaces.map((place) => (
                  <Marker
                    key={place.id}
                    position={[place.lat, place.lng]}
                  >
                    <Popup>
                      <strong>{place.name}</strong>
                      <br />
                      {place.address && <span>{place.address}</span>}
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          )}

          {nearbyPlaces.length > 0 && (
            <div className="nearby-list">
              <h3>Nearby Healthcare Facilities ({nearbyPlaces.length})</h3>
              <ul>
                {nearbyPlaces.slice(0, 5).map((place) => (
                  <li key={place.id} className="nearby-item">
                    <strong>{place.name}</strong>
                    {place.address && <small>{place.address}</small>}
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="directions-link"
                    >
                      Get Directions →
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showMap && nearbyPlaces.length === 0 && !loadingNearby && (
            <p className="text-muted" style={{ textAlign: 'center', marginTop: '16px' }}>
              No nearby specialists found. Try increasing the search radius.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Result;