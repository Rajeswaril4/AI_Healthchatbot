import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GoogleMap, Marker, InfoWindow } from "@react-google-maps/api";
import {
  Stethoscope,
  BarChart3,
  AlertTriangle,
  Printer,
  History,
  MapPin,
  Navigation,
  RefreshCcw
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import "../styles/Result.css";

const mapContainerStyle = {
  width: "100%",
  height: "400px",
  borderRadius: "12px"
};

const Result = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { api } = useAuth();

  const [predictionData, setPredictionData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [userLocation, setUserLocation] = useState(null);
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [activePlace, setActivePlace] = useState(null);

  const [showMap, setShowMap] = useState(false);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [locationError, setLocationError] = useState("");

  const [manualLocation, setManualLocation] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  /* ================= LOAD RESULT ================= */
  useEffect(() => {
    if (location.state?.prediction) {
      setPredictionData(location.state.prediction);
    } else if (location.state?.result) {
      setPredictionData(location.state.result);
    } else {
      navigate("/", { replace: true });
    }
    setLoading(false);
  }, [location, navigate]);

  const formatConfidence = (value) => {
    if (!value) return null;
    return (value <= 1 ? value * 100 : value).toFixed(1);
  };

  /* ================= AUTO LOCATION ================= */
  const handleFindNearby = () => {
    setLocationError("");
    setLoadingNearby(true);

    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      setLoadingNearby(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords;
        setUserLocation({ lat: latitude, lng: longitude });
        await fetchNearby(latitude, longitude);
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError(
              "Location permission denied. Allow location access or enter your city/pincode below."
            );
            break;
          case error.TIMEOUT:
            setLocationError("Location request timed out.");
            break;
          default:
            setLocationError("Unable to get your location.");
        }
        setLoadingNearby(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  /* ================= MANUAL LOCATION ================= */
  const handleManualLocationSearch = async () => {
    if (!manualLocation.trim()) {
      setLocationError("Please enter a city name or pincode.");
      return;
    }

    setManualLoading(true);
    setLocationError("");

    try {
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        manualLocation
      )}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;

      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();

      if (geoData.status !== "OK") {
        setLocationError("Location not found. Try another city or pincode.");
        setManualLoading(false);
        return;
      }

      const { lat, lng } = geoData.results[0].geometry.location;
      setUserLocation({ lat, lng });
      await fetchNearby(lat, lng);
    } catch {
      setLocationError("Failed to search location.");
    } finally {
      setManualLoading(false);
    }
  };

  /* ================= FETCH NEARBY ================= */
  const fetchNearby = async (lat, lng) => {
    try {
      const specialist = predictionData?.specialist || "hospital";

      const response = await api.get("/nearby", {
        params: { lat, lng, radius: 5000, specialist }
      });

      if (response.data.ok) {
        setNearbyPlaces(response.data.places || []);
        setShowMap(true);
      } else {
        setLocationError("No nearby healthcare facilities found.");
      }
    } catch {
      setLocationError("Failed to fetch nearby specialists.");
    } finally {
      setLoadingNearby(false);
    }
  };

  if (loading || !predictionData) {
    return <div className="loading-spinner">Loading results…</div>;
  }

  const {
    disease,
    description,
    precautions,
    specialist,
    confidence,
    conf_num
  } = predictionData;

  const confidencePercent = formatConfidence(confidence || conf_num);

  /* ================= RENDER ================= */
  return (
    <div className="result-container">
      <div className="result-card">
        <h1 className="disease-name">{disease}</h1>

        <div className="meta-row">
          {specialist && (
            <div className="meta-item">
              <Stethoscope size={18} /> {specialist}
            </div>
          )}
          {confidencePercent && (
            <div className="meta-item">
              <BarChart3 size={18} /> {confidencePercent}%
            </div>
          )}
        </div>

        <p>{description}</p>

        {precautions?.length > 0 && (
          <ul className="precautions">
            {precautions.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}

        <div className="actions">
          <button className="btn btn-primary" onClick={() => navigate("/")}>
            New Prediction
          </button>
          <button className="btn btn-outline" onClick={() => navigate("/history")}>
            <History size={16} /> History
          </button>
          <button className="btn btn-outline" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
        </div>

        {/* ===== NEARBY ===== */}
        <div className="nearby-section">
          <h3>
            <MapPin size={18} /> Find Nearby Specialists
          </h3>

          <button
            className="btn btn-primary"
            onClick={handleFindNearby}
            disabled={loadingNearby}
          >
            {loadingNearby ? "Searching…" : "Use My Location"}
          </button>

          {locationError && (
            <div className="location-error">
              <AlertTriangle size={16} />
              <span>{locationError}</span>
              <button className="retry-btn" onClick={handleFindNearby}>
                <RefreshCcw size={14} /> Retry
              </button>
            </div>
          )}

          {/* MANUAL INPUT */}
          <div className="manual-location-box">
            <p>Or enter your city / pincode:</p>
            <div className="manual-input-row">
              <input
                type="text"
                placeholder="e.g. Hyderabad or 500081"
                value={manualLocation}
                onChange={(e) => setManualLocation(e.target.value)}
              />
              <button
                className="btn btn-outline"
                onClick={handleManualLocationSearch}
                disabled={manualLoading}
              >
                {manualLoading ? "Searching…" : "Search"}
              </button>
            </div>
          </div>

          {showMap && userLocation && (
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={userLocation}
              zoom={13}
            >
              <Marker
                position={userLocation}
                icon="https://maps.gstatic.com/mapfiles/ms2/micons/blue-dot.png"
              />

              {nearbyPlaces.map((p) => (
                <Marker
                  key={p.id}
                  position={{ lat: p.lat, lng: p.lng }}
                  onClick={() => setActivePlace(p)}
                />
              ))}

              {activePlace && (
                <InfoWindow
                  position={{ lat: activePlace.lat, lng: activePlace.lng }}
                  onCloseClick={() => setActivePlace(null)}
                >
                  <div>
                    <strong>{activePlace.name}</strong>
                    <br />
                    <small>{activePlace.address}</small>
                    <br />
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${activePlace.lat},${activePlace.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Navigation size={14} /> Directions
                    </a>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          )}
        </div>
      </div>
    </div>
  );
};

export default Result;
