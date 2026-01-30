import React, { useState } from "react";
import { GoogleMap, MarkerF, InfoWindowF } from "@react-google-maps/api";
import {
  MapPin,
  Navigation,
  AlertTriangle,
  RefreshCcw,
  Search,
  Hospital,
  Stethoscope
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import "../styles/Nearby.css";

const mapContainerStyle = {
  width: "100%",
  height: "500px",
  borderRadius: "12px"
};

const SPECIALIST_TYPES = [
  { value: "hospital", label: "Hospital" },
  { value: "clinic", label: "Clinic" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "cardiologist", label: "Cardiologist" },
  { value: "dermatologist", label: "Dermatologist" },
  { value: "neurologist", label: "Neurologist" },
  { value: "pulmonologist", label: "Pulmonologist" },
  { value: "general physician", label: "General Physician" },
  { value: "pediatrician", label: "Pediatrician" },
  { value: "dentist", label: "Dentist" },
];

const Nearby = () => {
  const { api } = useAuth();

  const [userLocation, setUserLocation] = useState(null);
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [activePlace, setActivePlace] = useState(null);

  const [showMap, setShowMap] = useState(false);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [locationError, setLocationError] = useState("");

  const [manualLocation, setManualLocation] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  
  const [selectedSpecialist, setSelectedSpecialist] = useState("hospital");
  const [searchRadius, setSearchRadius] = useState(5000);

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
              "Location permission denied. Please allow location access or enter your city/pincode below."
            );
            break;
          case error.TIMEOUT:
            setLocationError("Location request timed out. Please try again.");
            break;
          default:
            setLocationError("Unable to get your location. Please try manual search.");
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
        setLocationError("Location not found. Please try another city or pincode.");
        setManualLoading(false);
        return;
      }

      const { lat, lng } = geoData.results[0].geometry.location;
      setUserLocation({ lat, lng });
      await fetchNearby(lat, lng);
    } catch (err) {
      console.error("Geocoding error:", err);
      setLocationError("Failed to search location. Please try again.");
    } finally {
      setManualLoading(false);
    }
  };

  /* ================= FETCH NEARBY ================= */
  const fetchNearby = async (lat, lng) => {
    try {
      const response = await api.get("/nearby", {
        params: { 
          lat, 
          lng, 
          radius: searchRadius, 
          specialist: selectedSpecialist 
        }
      });

      if (response.data.ok) {
        setNearbyPlaces(response.data.places || []);
        setShowMap(true);
        if (response.data.places.length === 0) {
          setLocationError(`No ${selectedSpecialist} found within ${searchRadius/1000}km. Try increasing the search radius.`);
        } else {
          setLocationError("");
        }
      } else {
        setLocationError("No nearby healthcare facilities found.");
      }
    } catch (err) {
      console.error("Nearby fetch error:", err);
      setLocationError("Failed to fetch nearby facilities. Please try again.");
    } finally {
      setLoadingNearby(false);
    }
  };

  /* ================= REFRESH SEARCH ================= */
  const handleRefreshSearch = () => {
    if (userLocation) {
      setLoadingNearby(true);
      fetchNearby(userLocation.lat, userLocation.lng);
    }
  };

  /* ================= RENDER ================= */
  return (
    <div className="nearby-container">
      <div className="nearby-card">
        <div className="nearby-header">
          <h1>
            <Hospital size={28} /> Find Nearby Healthcare
          </h1>
          <p className="nearby-subtitle">
            Locate hospitals, clinics, and specialists near you
          </p>
        </div>

        {/* SEARCH OPTIONS */}
        <div className="search-options">
          <div className="option-group">
            <label htmlFor="specialist-select">
              <Stethoscope size={16} /> Type of Facility
            </label>
            <select
              id="specialist-select"
              value={selectedSpecialist}
              onChange={(e) => setSelectedSpecialist(e.target.value)}
              className="specialist-select"
            >
              {SPECIALIST_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="option-group">
            <label htmlFor="radius-select">
              <MapPin size={16} /> Search Radius
            </label>
            <select
              id="radius-select"
              value={searchRadius}
              onChange={(e) => setSearchRadius(Number(e.target.value))}
              className="radius-select"
            >
              <option value={2000}>2 km</option>
              <option value={5000}>5 km</option>
              <option value={10000}>10 km</option>
              <option value={20000}>20 km</option>
            </select>
          </div>
        </div>

        {/* LOCATION BUTTONS */}
        <div className="location-actions">
          <button
            className="btn btn-primary location-btn"
            onClick={handleFindNearby}
            disabled={loadingNearby}
          >
            <MapPin size={18} />
            {loadingNearby ? "Searching..." : "Use My Location"}
          </button>

          {showMap && (
            <button
              className="btn btn-outline"
              onClick={handleRefreshSearch}
              disabled={loadingNearby}
            >
              <RefreshCcw size={16} /> Refresh Results
            </button>
          )}
        </div>

        {/* MANUAL LOCATION SEARCH */}
        <div className="manual-location-section">
          <div className="divider">
            <span>OR</span>
          </div>

          <div className="manual-search">
            <input
              type="text"
              placeholder="Enter city name or pincode (e.g., Hyderabad, 500081)"
              value={manualLocation}
              onChange={(e) => setManualLocation(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleManualLocationSearch();
                }
              }}
              className="location-input"
            />
            <button
              className="btn btn-primary search-btn"
              onClick={handleManualLocationSearch}
              disabled={manualLoading}
            >
              <Search size={18} />
              {manualLoading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {/* ERROR MESSAGE */}
        {locationError && (
          <div className="error-banner">
            <AlertTriangle size={18} />
            <span>{locationError}</span>
          </div>
        )}

        {/* RESULTS COUNT */}
        {showMap && nearbyPlaces.length > 0 && (
          <div className="results-info">
            <p>
              Found <strong>{nearbyPlaces.length}</strong> {selectedSpecialist}{nearbyPlaces.length !== 1 ? 's' : ''} within {searchRadius/1000} km
            </p>
          </div>
        )}

        {/* MAP */}
        {showMap && userLocation && (
          <div className="map-wrapper">
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={userLocation}
              zoom={13}
              options={{
                mapId: "healthcare_map",
                zoomControl: true,
                streetViewControl: false,
                mapTypeControl: false,
                fullscreenControl: true
              }}
            >
              {/* User Location */}
              <MarkerF
                position={userLocation}
                icon={{
                  url: "https://maps.gstatic.com/mapfiles/ms2/micons/blue-dot.png",
                  scaledSize: new window.google.maps.Size(40, 40)
                }}
                title="Your Location"
              />

              {/* Nearby Places */}
              {nearbyPlaces.map((place) => (
                <MarkerF
                  key={place.id}
                  position={{ lat: place.lat, lng: place.lng }}
                  onClick={() => setActivePlace(place)}
                  title={place.name}
                  animation={window.google.maps.Animation.DROP}
                />
              ))}

              {/* Info Window */}
              {activePlace && (
                <InfoWindowF
                  position={{ lat: activePlace.lat, lng: activePlace.lng }}
                  onCloseClick={() => setActivePlace(null)}
                >
                  <div className="info-window-content">
                    <h3>{activePlace.name}</h3>
                    {activePlace.address && (
                      <p className="info-address">{activePlace.address}</p>
                    )}
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${activePlace.lat},${activePlace.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="directions-link"
                    >
                      <Navigation size={14} /> Get Directions
                    </a>
                  </div>
                </InfoWindowF>
              )}
            </GoogleMap>
          </div>
        )}

        {/* PLACES LIST */}
        {showMap && nearbyPlaces.length > 0 && (
          <div className="places-list">
            <h3>
              <Hospital size={20} /> Nearby Facilities
            </h3>
            <div className="places-grid">
              {nearbyPlaces.slice(0, 10).map((place, index) => (
                <div 
                  key={place.id} 
                  className="place-card"
                  onClick={() => setActivePlace(place)}
                >
                  <div className="place-number">{index + 1}</div>
                  <div className="place-info">
                    <h4>{place.name}</h4>
                    {place.address && (
                      <p className="place-address">{place.address}</p>
                    )}
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="place-directions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Navigation size={14} /> Directions
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Nearby;