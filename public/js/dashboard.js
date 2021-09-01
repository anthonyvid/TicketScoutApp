"use strict";

import { Loader } from "https://unpkg.com/@googlemaps/js-api-loader@1.0.0/dist/index.esm.js";
import * as helper from "./helper/helper.js";

const loader = new Loader({
	apiKey: "AIzaSyAhyEiRQ5Xs5UijEum0VdIGWx3nI-NeH_0",
	version: "weekly",
});

const tableRows = document.querySelectorAll("#table_row");
const greeting = document.getElementById("greeting");
const ticketIDInput = document.getElementById("ticket_ID_input");
const trackBtn = document.getElementById("track_btn");
let greet = new Date();

/**
 * Will hide all tickets with status as "Resolved"
 */
const clearResolvedTickets = () => {
	let rows = 0;
	for (const row of tableRows) {
		const status =
			row.firstElementChild.nextElementSibling.nextElementSibling.nextElementSibling.textContent.trim();
		if (status == "Resolved") {
			row.style.display = "none";
			continue;
		} else {
			rows++;
		}
		if (rows > 3) row.style.display = "none";
	}
};
clearResolvedTickets(); // Run asap

if (greet.getHours() >= 0 && greet.getHours() < 12) {
	greeting.insertAdjacentHTML("afterbegin", `Good morning, `);
} else if (greet.getHours() >= 12 && greet.getHours() <= 17) {
	greeting.insertAdjacentHTML("afterbegin", `Good afternoon, `);
} else if (greet.getHours() >= 17 && greet.getHours() < 24) {
	greeting.insertAdjacentHTML("afterbegin", `Good evening, `);
}

const defaultLat = 43.687736;
const defaultLng = -79.46496;

const showMap = (lat, lng) => {
	let map;

	loader.load().then(() => {
		map = new google.maps.Map(document.getElementById("map"), {
			center: { lat: lat, lng: lng },
			zoom: 10,
			mapId: "d2b1b19d316aa6a9",
			disableDefaultUI: true,
		});
		if (lat != defaultLat && lng != defaultLng) {
			var marker = new google.maps.Marker({
				map: map,
				position: new google.maps.LatLng(lat, lng),
			});
		}
	});
};

const trackingLoadingAnimation = async () => {
	document.querySelector(".tracking-info").classList.add("hidden");
	document.querySelector(".map-animation").classList.remove("hidden");
	document.querySelector(".lottie-animation").classList.remove("hidden");
	return new Promise((resolve) =>
		setTimeout(() => {
			document.querySelector(".map-animation").classList.add("hidden");
			resolve();
		}, 3000)
	);
};

const getLatLngByZipcode = async (address) => {
	let geocoder = new google.maps.Geocoder();

	await geocoder.geocode({ address: address }, (results, status) => {
		if (status == google.maps.GeocoderStatus.OK) {
			showMap(
				results[0].geometry.location.lat(),
				results[0].geometry.location.lng()
			);
		} else {
			console.log("Error: " + status);
		}
	});
};

const showTrackingDetails = async (trackingObj) => {
	document.querySelector(".map-animation").classList.add("hidden");
	document.querySelector(".lottie-animation").classList.add("hidden");
	document.querySelector(".tracking-info").classList.remove("hidden");

	const { eta, from, status, to, location } = trackingObj;

	const zip = typeof location.zip != "undefined" ? location.zip : "";
	const city = typeof location.city != "undefined" ? location.city : "";
	const country =
		typeof location.country != "undefined" ? location.country : "";

	await getLatLngByZipcode(`${city} ${zip} ${country}`);

	document.getElementById("status_text").textContent =
		status !== null ? status : "Unavailable";
	document.getElementById("location_text").textContent =
		location !== null ? location.city : "Unavailable";
	document.getElementById("eta_text").textContent =
		eta !== null ? new Date(eta).toLocaleDateString() : "Unavailable";
	document.getElementById("from_text").textContent =
		from !== null ? from.city : "Unavailable";
};

ticketIDInput.addEventListener(
	"click",
	() => {
		showMap(defaultLat, defaultLng);
	},
	{ once: true }
);

trackBtn.addEventListener("click", async () => {
	if (ticketIDInput.value.length < 4 || !/^\d+$/.test(ticketIDInput.value)) {
		helper.showInvalidColour(ticketIDInput);
		return;
	}

	const data = await helper.postReq("/tickets/track-shipment", {
		ticketID: ticketIDInput.value,
	});
	if (data.result.hasOwnProperty("tracking_error")) {
		helper.showInvalidColour(ticketIDInput);
		return;
	}

	// Show loading animation
	await trackingLoadingAnimation();
	// Display tracking details
	await showTrackingDetails(data.result);
});
