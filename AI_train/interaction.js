$(document).ready(function () {


    var IMG_PATH = ""; // when using local stored images
    var CSV_PATH = 'data.csv';

    var selectedKey = -1; // current selected key
    var dataOpen = new Map();
    var dataClosed = new Map()
	var move = true;

    // map marker
    var markerUser = createUserMarker(0);
    var markerEstimated = [];
    var markerReal = [];

    // stats
    var number_images = 0;
    var distance_user_sum = 0;
    var distance_model_sum = 0;
    var number_user_hit_model = 0;

    /**
     * Creates a custom user marker
     * and returns the marker.
     */
    function createUserMarker(deg) {
        var userIcon = L.icon({
            iconUrl: 'demo/leaflet/images/custom/marker_user.svg',
            iconSize: [34, 57],
            iconAnchor: [17, 57],
            popupAnchor: [0, -57]
        });

        var options = {
            draggable: true,
            icon: userIcon,
            rotationAngle: deg,
            zIndexOffset: 1000 // user marker always on top
        };
        return L.marker([0.0, 0.0], options);
    }

    $('.close').on('click',function() {
        //$(this).closest('.card').fadeOut();
        //$('.collapse').toggle();
      })

    /**
     * Creates a custom marker for GT and Machine.
     * @param {String} path
     */
    function createMarker(path, deg) {
        var userIcon = L.icon({
            iconUrl: path,
            iconSize: [16, 27],
            iconAnchor: [8, 27],
            popupAnchor: [0, -28],
        });

        var options = {
            icon: userIcon,
            rotationAngle: deg
        };
        var marker = L.marker([20.0, 0.0], options);

        marker.bindPopup("");
        return marker;
    }

    function containsObject(obj, list) {
        var i;
        for (i = 0; i < list.length; i++) {
            if (list[i] === obj) {
                return true;
            }
        }

        return false;
    }


    // have to set height of the map explicitly due to leaflet
    function updateMapSize() {
        if ($(window).width() < 768) {
            $('#guess_location_desktop').hide();
            $('#guess_location_mobile').show();
        } else if ($(window).width() >= 600) {
            $('#guess_location_desktop').show();
            $('#guess_location_mobile').hide();
        }
        if ($(window).width() > 768) {
            $('#map').height($('#image-card').height() - $('#legend').height() - 4);

        }
    }

    $(window).on('resize', function(){
        updateMapSize();
    });


    /**
     * Performs an ajax request to the CSV file and fills the data structures.
     */
    function initialize_data() {
        $.ajax({
            type: "GET",
            url: CSV_PATH,
            dataType: "text",
            success: function (response) {

                console.log("read csv file");
                list = $.csv.toObjects(response);
                list = list.sort(function (a, b) { return a.gt_lat - b.gt_lat }); // shuffle list
                console.debug("number or rows read from csv: " + list.length);

                console.log(list.length)

                for (var i = 1; i < list.length; i++) {
                    var item = list[i];
                    console.log(item.gt_lat);

                    L.circleMarker([item.gt_lat, item.gt_long], {color: 'blue', radius:10, weight:0}).addTo(map);
                }

                move = false

                updateTabText();
                updateMapSize();
            }
        });

    }

    /**
     * Adds list group items to the open image list
     *
     * @param {*} img_path
     * @param {*} index
     * @param {*} key the image id
     */
    function addImageToList(img_path, index, key) {

        $("#list-images-open").append(
            "<a class='list-group-item' data-toggle='list' data-alias='" + index + "' id='" + index + "'>" +
            "<img src='" + img_path + "'  alt='' class='img-fluid round-borders'>" +
            "</a>"
        );
    }

    /**
     * Randomly selects a key from current dataOpen
     */
    function getRandomKey() {
        keyList = Array.from(dataOpen.keys());
        var random = Math.floor(Math.random() * keyList.length);
        return keyList[random];
    }

    function init(item) {

        $(".image_full").attr("src", IMG_PATH + item.url);
        $(".preview").attr("src", IMG_PATH + item.url);

        // photo licence
        $(".license_text").text("©" + item.author + ' ' + item.license_name);

        // map preferences
        markerReal.setLatLng(new L.LatLng(item.gt_lat, item.gt_long));
        markerEstimated.setLatLng(new L.LatLng(item.predicted_lat, item.predicted_long));
        map.removeLayer(markerReal);
        map.removeLayer(markerEstimated);

        map.setView([15.0, 0.0], zoom=2);
        markerUser.setLatLng([0.0, 0.0]);
		markerUser.dragging.enable();
		move = true;

        // set results to default
        $("#distance_model").removeClass("alert-danger alert-success").addClass("alert-secondary");
        $("#distance_user").removeClass("alert-danger alert-success").addClass("alert-secondary");
        $("#distance_user").text("You: ");
        $("#distance_model").text("Model: ");
    }

    /**
     * Update the UI elements for distance to user and distance to model
     *
     * @param {*} distance_user the distance in km from user's marker to gt location
     * @param {*} distance_model the distance in km from model's marker to gt location
     */
    function resultUpdate(distance_user, distance_model) {

        $("#distance_user").html("<b>You:</b> " + distance_user.toFixed(2) + " km");
        $("#distance_model").html("<b>Model:</b> " + distance_model.toFixed(2) + " km");

        if (distance_user <= distance_model) {
            $("#distance_user").removeClass("alert-secondary alert-success alert-danger").addClass("alert-success");
            $("#distance_model").removeClass("alert-secondary alert-success alert-danger").addClass("alert-danger");
        } else {
            $("#distance_model").removeClass("alert-secondary alert-success alert-danger").addClass("alert-success");
            $("#distance_user").removeClass("alert-secondary alert-success alert-danger").addClass("alert-danger");
        }
    }

    /**
     * Complete reset of the UI.
     */
    $("#reset_image_list").click(function () {
        dataOpen = new Map();
        dataClosed = new Map();
        number_images = 0;
        distance_user_sum = 0;
        distance_model_sum = 0;
        number_user_hit_model = 0;

        $("#list-images-open").empty();
        $("#list-images-closed").empty();
        $("#annotated_total_text").text("Annotated images: 0")
        $("#rate_of_sucess_text").text("Rate of sucess: ---")
        $("#mean_error_user_text").text("Your mean error: ---");
        $("#mean_error_model_text").text("Model's mean error: ---");

        $("#open_tab_title").tab("show");

        initialize_data();

    });

    /**
     * Choose a random image from dataOpen.
     */
    $("#btn_random_image").click(function () {
		if (dataOpen.size == 0) {
			return;
        }

        $(".btn_show_result").prop("disabled", false); // activate button
        selectedKey = getRandomKey();
        console.debug("choose a random image: " + selectedKey);
        init(dataOpen.get(selectedKey));

    });

    /**
     * Click event listener for current selected list-group-item.
     */
    $(document).on('click', '.list-group-item', function () {

        // get key from data alias
        var $this = $(this);
        selectedKey = $this.data('alias');
        console.debug("list group item selected");

        // in which list was the event triggered?
        if (dataOpen.has(selectedKey)) {
            // just initialize this image
            init(dataOpen.get(selectedKey));
            $(".btn_show_result").prop("disabled", false);

        } else if (dataClosed.has(selectedKey)) {
            // view actually annotated results.
            $(".btn_show_result").prop("disabled", true);

            var item = dataClosed.get(selectedKey);
            $(".image_full_closed").attr("src", IMG_PATH + item.url);
            $(".preview_closed").attr("src", IMG_PATH + item.url);
            $(".license_text_closed").text("©" + item.author + ' ' + item.license_name)

            //map.setView([15.0, 0.0], zoom=2);

            markerReal.setLatLng(new L.LatLng(item.gt_lat, item.gt_long));
            markerEstimated.setLatLng(new L.LatLng(item.predicted_lat, item.predicted_long));
            markerEstimated.addTo(map);
            markerReal.addTo(map);
            markerUser.setLatLng(new L.LatLng(item.marker_user_lat, item.marker_user_lng));

            var latitudes = [markerReal.getLatLng().lat, markerEstimated.getLatLng().lat, markerUser.getLatLng().lat];
            var longitudes = [markerReal.getLatLng().lng, markerEstimated.getLatLng().lng, markerUser.getLatLng().lng];
            console.log(latitudes);
            console.log(longitudes);
            var corner1 = L.latLng(Math.min(...latitudes), Math.min(...longitudes));
            var corner2 = L.latLng(Math.max(...latitudes), Math.max(...longitudes));
            console.log(corner1);
            console.log(corner2);
            map.fitBounds(L.latLngBounds(corner1, corner2), {padding: [50, 50]});

            // distanceTo() calculates the great circle distance (equal to stored values in csv)
            var distance_user = markerReal.getLatLng().distanceTo(markerUser.getLatLng()) / 1000;
            var distance_model = markerReal.getLatLng().distanceTo(markerEstimated.getLatLng()) / 1000;
            resultUpdate(distance_user, distance_model);

        }

    });


    $('a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
        e.target // newly activated tab
        e.relatedTarget // previous active tab

        console.log("tab changed " + e.target);
        $('#btn_random_image').toggle();

        if (dataOpen.size == 0) {

        } else if (dataClosed.size == 0) {
            $('.alert-warning').alert();
        } else {
            $('.alert-warning').alert('close');
        }

    });

    function updateTabText() {
        $("#open_tab_title").html("Open (" + dataOpen.size + "/" + (dataOpen.size + dataClosed.size) + ")");
        $("#closed_tab_title").html("Annotated (" + dataClosed.size + "/" + (dataOpen.size + dataClosed.size) + ")");
    }

    /**
     * Event listener for Guess Location button click.
     *
     */
    $(".btn_show_result").click(function () {
        var $this = $(this);
        $this.prop("disabled", true);

        // update markup popups and positions
        //map.setView([15.0, 0.0], zoom=2);

        var latitudes = [markerReal.getLatLng().lat, markerEstimated.getLatLng().lat, markerUser.getLatLng().lat];
        var longitudes = [markerReal.getLatLng().lng, markerEstimated.getLatLng().lng, markerUser.getLatLng().lng];
        console.log(latitudes);
        console.log(longitudes);
        var corner1 = L.latLng(Math.min(...latitudes), Math.min(...longitudes));
        var corner2 = L.latLng(Math.max(...latitudes), Math.max(...longitudes));
        console.log(corner1);
        console.log(corner2);
        map.fitBounds(L.latLngBounds(corner1, corner2), {padding: [50, 50]});

        markerEstimated.bindPopup("<b>Model:</b><br>" + markerEstimated.getLatLng().toString());
        markerReal.bindPopup("<b>Ground Truth:</b><br>" + markerReal.getLatLng().toString());
        markerEstimated.addTo(map).update();
        markerReal.addTo(map).update();
		markerUser.dragging.disable();
		move = false;


        // show distance results
        var distance_user = markerReal.getLatLng().distanceTo(markerUser.getLatLng()) / 1000;
        var distance_model = markerReal.getLatLng().distanceTo(markerEstimated.getLatLng()) / 1000;
        resultUpdate(distance_user, distance_model);

        // update lists
        var item = dataOpen.get(selectedKey);


        // keep marker from user
        item.marker_user_lat = markerUser.getLatLng().lat;
        item.marker_user_lng = markerUser.getLatLng().lng;

        dataClosed.set(selectedKey, item);
        // set preview closed image
        if (dataClosed.size == 1) {
            $(".image_full_closed").attr("src", IMG_PATH + item.url);
            $(".license_text_closed").text("©" + item.author + ' ' + item.license_name)

        }

        if (distance_user <= distance_model) {
            $("#list-images-closed").append(
                "<a class='list-group-item' data-toggle='list' data-alias='" + selectedKey + "' id='" + selectedKey + "'>" +
                "<img src='" + IMG_PATH + dataClosed.get(selectedKey).url + "'  alt='' class='img-fluid round-borders' style='box-shadow: 0 0 20px #5cb85c;'>" +
                "</a>"
            );
        } else {
            $("#list-images-closed").append(
                "<a class='list-group-item' data-toggle='list' data-alias='" + selectedKey + "' id='" + selectedKey + "'>" +
                "<img src='" + IMG_PATH + dataClosed.get(selectedKey).url + "'  alt='' class='img-fluid round-borders' style='box-shadow: 0 0 20px #d9534f;'>" +
                "</a>"
            );
        }

        dataOpen.delete(selectedKey); // remove item from dataOpen
        $("#" + selectedKey).remove() // remove item from open image list

        updateTabText();

        // update stats and view results
        number_images++;
        distance_model_sum += distance_model;
        distance_user_sum += distance_user;
        if (distance_user < distance_model) {
            number_user_hit_model++;
        }
        $("#annotated_total_text").text("Annotated images: " + number_images)
        $("#rate_of_sucess_text").text("Rate of sucess: " + number_user_hit_model + " / " + number_images + " (" + (number_user_hit_model / number_images * 100).toFixed(1) + " %)");
        $("#mean_error_user_text").text("Your mean error: " + (distance_user_sum / number_images).toFixed(1) + " km");
        $("#mean_error_model_text").text("Model's mean error: " + (distance_model_sum / number_images).toFixed(1) + " km");
    });

    // update user marker when click on map
    function onMapClick(e) {
        console.log(move)
		if (!move) {
			return;
		}
        markerUser.setLatLng(e.latlng);
        markerUser.bindPopup("<b>Your estimation:</b><br>" + e.latlng.toString());
    }

    // when document ready:

    // build the map
    var map = L.map('map', {
        center: L.latLng([0.0, 0.0]),
        zoom: 1,
    });
    var popup = L.popup();
    L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
        attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> <strong><a href="https://www.mapbox.com/map-feedback/" target="_blank">Improve this map</a></strong>',
        tileSize: 512,
        maxZoom: 18,
        zoomOffset: -1,
        id: 'mapbox/outdoors-v11',
        accessToken: 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw'
    }).addTo(map);



    // default style of the results
    $("#distance_model").removeClass("alert-danger alert-success").addClass("alert-secondary");
    $("#distance_user").removeClass("alert-danger alert-success").addClass("alert-secondary");
    $("#distance_user").text("You: ");
    $("#distance_model").text("Model: ");


    initialize_data();
    updateMapSize();



});
