import { GoogleMap, Marker, InfoWindow } from "@react-google-maps/api";
import { useState } from "react";

const containerStyle = {
  width: "100%",
  height: "400px",
};

export default function GoogleMapView({
  userLocation,
  places,
}) {
  const [activePlace, setActivePlace] = useState(null);

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={userLocation}
      zoom={13}
      options={{
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
      }}
    >
      {/* USER LOCATION */}
      <Marker
        position={userLocation}
        icon={{
          url: "https://maps.gstatic.com/mapfiles/ms2/micons/blue-dot.png",
        }}
      />

      {/* NEARBY PLACES */}
      {places.map((place) => (
        <Marker
          key={place.id}
          position={{ lat: place.lat, lng: place.lng }}
          onClick={() => setActivePlace(place)}
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
            {activePlace.address}
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
