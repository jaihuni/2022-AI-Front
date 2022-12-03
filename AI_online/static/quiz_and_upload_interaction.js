$(document).ready(function() {
    // #################################################################################################################
    // VARIABLES
    // #################################################################################################################
    var IMG_PATH = media_url + 'im2gps/img/'; // when using local stored images
    var CSV_PATH = static_url + 'data/scene_M_p_im2gps.csv';
    var ACTIVATIONMAP_TEXT = "We are working on an improved visualization, since currently it could fail on some examples.";
    var selectedKey = -1; // current selected key
    var dataOpen = new Map();
    var dataClosed = new Map();
    var move = true;
    // map marker
    var markerUser = createMarker(static_url + 'leaflet/images/custom/marker_user.svg', 0, draggable = true);
    var markerEstimated = createMarker(static_url + 'leaflet/images/custom/marker_machine.svg', -10);
    var markerReal = createMarker(static_url + 'leaflet/images/custom/marker_GT_world.svg', 10);

    // initial heatmap settings
    var eps = 0.001;
    var cfg = {
        "radius": 6,
        "minOpacity": 0.0,
        "maxOpacity": 0.65,
        "scaleRadius": false,
        "useLocalExtrema": false,
        "valueField": "prob",
        "gradient": {
            "1": "rgb(175, 20, 20)",
            "0": "rgb(175, 20, 20)",
        },
    };
    var heat = new HeatmapOverlay(cfg);
    // stats
    var number_images = 0;
    var distance_user_sum = 0;
    var distance_model_sum = 0;
    var number_user_hit_model = 0;

    // upload functionality
    var IMG_PATH_UPLOAD = media_url + 'user/img/';
    var selectedTab = "open_tab_title";
    var markerEXIF = createMarker(static_url + 'leaflet/images/custom/marker_exif.svg', 10);
    var available_EXIF = false;
    var heatUpload = new HeatmapOverlay(cfg);

    // #################################################################################################################
    // FUNCTIONS
    // #################################################################################################################

    function showError(message) {
        console.debug("Error: " + message);
        $("#alert-wrapper").html("<div class='alert alert-danger alert-dismissible fade show' role='alert'><strong>Error!</strong> " + message +
            "<button type='button' class='close' data-dismiss='alert' aria-label='Close'>" +
            "<span aria-hidden='true'>&times;</span></button></div>");

    }

    $("#termsOfServiceCheckbox").change(function() {
        var checkBox = $(this);
        if (checkBox.prop("checked")) {
            $("#file_upload_button").prop("disabled", false);
        } else {
            $("#file_upload_button").prop("disabled", true);
        }
        
    })

    function removeErrorAlert() {
        $("#alert-wrapper").empty();
    }

    /**
     * Image upload
     */
    $('#file').change(function(e) {
        resetUploaded();
        resetQuiz();
        markerUser.setLatLng([0.0, 0.0]);
        $(".btn_show_result").prop("disabled", true);
        $.ajax({
            type: 'POST',
            url: root_url + 'upload_file',
            data: new FormData($("#upload-form")[0]),
            processData: false,
            contentType: false,
            beforeSend: function() {
                $(".spinner-upload").show();
                $(".btn").prop("disabled", true);
                $(".list-group-image-item").prop("disabled", true);
            },
            complete: function() {
                $(".spinner-upload").hide();
                $(".btn").prop("disabled", false);
                $(".list-group-image-item").prop("disabled", false);
            },
            success: function(data) {
                if (typeof data.image_id === "undefined" || typeof data.image_path === "undefined") {
                    console.log(data);
                    showError("Error while uploading image");
                }
                $(".upload_text").text("");
                $(".heatmap").width("100%");
                console.log('Uploaded file ' + data.image_id);
                $(".image_full_upload").attr("src", data.image_path);
                $(".image_full_upload").attr("image_id", data.image_id);
                $(".preview_upload").attr("src", IMG_PATH_UPLOAD + data.image_id + '.jpg');

                $(".btn_show_result").prop("disabled", false);
            },
            error: function(error_response) {
                console.log(error_response);
                showError("Error while uploading image");
            }
        });
    });

    function get_gps_coordinate_from_exif(number) {
        return number[0].numerator + number[1].numerator /
            (60 * number[1].denominator) + number[2].numerator / (3600 * number[2].denominator);
    };

    function fitMapToMarker() {
        if (available_EXIF) {
            var latitudes = [markerEstimated.getLatLng().lat, markerUser.getLatLng().lat, markerEXIF.getLatLng().lat];
            var longitudes = [markerEstimated.getLatLng().lng, markerUser.getLatLng().lng, markerEXIF.getLatLng().lng];
        } else {
            var latitudes = [markerEstimated.getLatLng().lat, markerUser.getLatLng().lat];
            var longitudes = [markerEstimated.getLatLng().lng, markerUser.getLatLng().lng];
        }

        var corner1 = L.latLng(Math.min(...latitudes), Math.min(...longitudes));
        var corner2 = L.latLng(Math.max(...latitudes), Math.max(...longitudes));
        map.fitBounds(L.latLngBounds(corner1, corner2), {
            padding: [50, 50]
        });
    }

    /**
     * Creates a custom marker for GT and Machine.
     * @param {String} path
     */
    function createMarker(icon_path, icon_rot, draggable = false) {
        var userIcon = L.icon({
            iconUrl: icon_path,
            iconSize: [34, 57],
            iconAnchor: [17, 57],
            popupAnchor: [0, -57]
        });
        var options = {
            draggable: draggable,
            icon: userIcon,
            rotationAngle: icon_rot,
            zIndexOffset: 1000 // user marker always on top
        };
        return L.marker([0.0, 0.0], options);
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

    $(window).on('resize', function() {
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
            success: function(response) {
                console.log("read csv file");
                list = $.csv.toObjects(response);
                list = list.sort(function() {
                    return 0.5 - Math.random()
                }); // shuffle list
                console.debug("number or rows read from csv: " + list.length);
                // 'All Rights Reserved', 'No known copyright restrictions', 'United States Government Work', 'Public Domain Mark'
                allowed_licenses = ['CC-BY-NC-SA 2.0', 'CC-BY-NC 2.0', 'CC-BY-NC-ND 2.0', 'CC-BY 2.0', 'CC-BY-SA 2.0', 'CC-BY-ND 2.0', 'CC0']
                for (var i = 0; i < list.length; i++) {
                    if ((list[i].available == "1") && (containsObject(list[i].license_name, allowed_licenses))) {
                        dataOpen.set(i, list[i]); // fill map
                        addImageToList(list[i].url, list[i].img_id, i); // fill list of images
                    }
                }
                // inital choose a random image
                selectedKey = dataOpen.keys().next().value;
                init(dataOpen.get(selectedKey));
                $(".btn_show_result").prop("disabled", false);
                updateTabText();
                updateMapSize();
            }
        });
    }

    function addImageToList(img_path, img_id, index, key) {
        $("#list-images-open").append("<a class='list-group-item list-group-image-item' data-toggle='list' data-alias='" + index + "' id='" + index + "'>" + "<img src='" + img_path + "'  alt='' class='img-fluid round-borders' image_id='" + img_id + "'>" + "</a>");
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
        $(".image_full").attr("src", IMG_PATH + item.img_id + '.jpg');
        $(".preview").attr("src", IMG_PATH + item.img_id + '.jpg');

        $(".image_full").attr("image_id", item.img_id);
        $(".preview").attr("image_id", item.img_id);

        // photo licence
        $(".license_text").text("©" + item.author + ' ' + item.license_name);
        // map preferences
        markerReal.setLatLng(new L.LatLng(item.gt_lat, item.gt_long));
        markerEstimated.setLatLng(new L.LatLng(item.predicted_lat, item.predicted_long));
        resetQuiz();
        $(".image_full_upload").attr("src", "");
        resetUploaded();
        $(".heatmap").width("100%");
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

    function activationMapResponseToDataPoints(response, img_width, img_height) {
        dataPoints = [];
        for (var i = 0; i < response.length; i++) {
            for (var j = 0; j < response[0].length; j++) {
                dataPoint = {
                    "y": Math.round(img_height / (response.length + 1) * (i + 1)),
                    "x": Math.round(img_width / (response[0].length + 1) * (j + 1)),
                    "value": response[i][j]
                };
                dataPoints.push(dataPoint);
            }
        }
        return dataPoints;
    }

    /**
     * Get the scene probabilities for a given image id and visualizes the results
     * @param {*} img_id
     */
    function calculateAndSetSceneProbabilities(img_id) {

        console.log('calling /get_scene_prediction/' + img_id.attr("image_id"));
        $.ajax({
            type: 'GET',
            url: root_url + 'get_scene_prediction/' + img_id.attr("image_id"),
            beforeSend: function() {
                $(".spinner-guess-location").show();
                $(".btn").prop("disabled", true);
                $(".list-group-image-item").prop("disabled", true);
            },
            complete: function() {
                $(".spinner-guess-location").hide();
                $(".btn").prop("disabled", false);
                $(".btn_show_result").prop("disabled", true);
                $(".list-group-image-item").prop("disabled", false);
            },
            success: function(response_scene) {
                if (response_scene.hdf_content == "ERROR") {
                    console.log("Error while receiving hdf content");
                    console.log(response_scene);
                }

                setSceneProbabilities(response_scene.p_indoor, response_scene.p_natural, response_scene.p_urban, response_scene.predicted_scene_label);
            },
            error: function() {
                showError("Error while calling get_scene_prediction/" + img_id.attr("image_id"));
            }
        });
    }

    function setSceneProbabilities(p_indoor, p_natural, p_urban, predicted_scene_label) {
        $("#prob_indoor_text").text("Probability indoor: " + (100 * p_indoor).toFixed(2) + "%");
        $("#prob_natural_text").text("Probability nature: " + (100 * p_natural).toFixed(2) + "%");
        $("#prob_urban_text").text("Probability urban: " + (100 * p_urban).toFixed(2) + "%");
        $("#predicted_scene_text").text("Predicted scene: " + predicted_scene_label);
    }

    /**
     * Renders the CAM image for a given image.
     *
     * @param {*} image input image for prediction and rendering
     * @param {*} predicted_cell_id respective cell id for CAM image
     * @param {*} heatmapId heatmap id for rendering
     */
    function activationMapOverlay(image, predicted_cell_id, heatmapId) {
        var image_id = image.attr("image_id");
        console.log('calling /get_class_activation_map/' + image_id + '/3/' + predicted_cell_id);

        $.ajax({
            type: 'GET',
            url: root_url + 'get_class_activation_map/' + image_id + '/3/' + predicted_cell_id,
            success: function(response_cam) {
                if (response_cam.hdf_content == "ERROR") {
                    console.log("Error while receiving hdf content");
                    console.log(response_cam);
                }

                var width = image.width();
                var height = image.height();
                var radius;
                if (width < height) {
                    radius = width / 7.0;
                } else {
                    radius = height / 7.0;
                }

                $(".heatmap").width(width);
                var activationHeatMap = h337.create({
                    container: document.getElementById(heatmapId),
                    "radius": radius * 1.5,
                    "minOpacity": 0.4,
                    "maxOpacity": 0.4,
                    "blur": 0.7,
                    "gradient": {
                        .25: "rgb(0,0,255)",
                        .70: "rgb(0,255,0)",
                        .90: "yellow",
                        .95: "rgb(255,0,0)"
                    }
                });

                // map response to data points
                var dataPoints = activationMapResponseToDataPoints(response_cam.class_activation_map, width, height);

                var data = {
                    "max": 255,
                    "min": 50,
                    "data": dataPoints
                };
                // fill CAM heatmap
                activationHeatMap.setData(data);
                if (heatmapId == "heatmap") {
                    $(".license_text").text(ACTIVATIONMAP_TEXT);
                } else if (heatmapId == "heatmap_closed") {
                    $(".license_text_closed").text(ACTIVATIONMAP_TEXT);
                } else if (heatmapId == "heatmap_upload") {
                    $(".upload_text").text(ACTIVATIONMAP_TEXT);
                }
                
            },
            error: function() {
                showError('Error while calling /get_class_activation_map/' + image_id + '/3/' + predicted_cell_id);
            }
        });
    }

    /**
     * Complete reset of the UI.
     */
    $("#reset_image_list").click(function() {
        removeErrorAlert();
        dataOpen = new Map();
        dataClosed = new Map();
        number_images = 0;
        distance_user_sum = 0;
        distance_model_sum = 0;
        number_user_hit_model = 0;
        $("#list-images-open").empty();
        $("#list-images-closed").empty();
        $("#annotated_total_text").text("Annotated images: 0");
        $("#rate_of_sucess_text").text("Rate of sucess: ---");
        $("#mean_error_user_text").text("Your mean error: ---");
        $("#mean_error_model_text").text("Model's mean error: ---");
        $("#open_tab_title").tab("show");
        $("#prob_indoor_text").text("Probability indoor: --- ");
        $("#prob_natural_text").text("Probability nature: ---");
        $("#prob_urban_text").text("Probability urban: ---");
        $("#predicted_scene_text").text("Predicted scene: ---");

        $(".heatmap-canvas").remove();
        $(".image_full_upload").attr("src", "");
        resetUploaded();

        initialize_data();
    });

    /**
     * Choose a random image from dataOpen.
     */
    $("#btn_random_image").click(function() {
        if (dataOpen.size == 0) {
            return;
        }
        $(".heatmap").find(".heatmap-canvas").remove();
        $(".btn_show_result").prop("disabled", false); // activate button
        selectedKey = getRandomKey();
        console.debug("choose a random image: " + selectedKey);
        init(dataOpen.get(selectedKey));
    });

    /**
     * Click event listener for current selected list-group-item.
     */
    $(document).on('click', '.list-group-image-item', function() {
        resetQuiz();
        resetUploaded();
        // get key from data alias
        var $this = $(this);
        selectedKey = $this.data('alias');
        console.debug("list group item selected");
        // in which list was the event triggered?
        if (dataOpen.has(selectedKey)) {
            // remove heatmap and restore heatmap wrapper size
            $(".heatmap").find(".heatmap-canvas").remove();
            // just initialize this image
            init(dataOpen.get(selectedKey));
            $(".btn_show_result").prop("disabled", false);
        } else if (dataClosed.has(selectedKey)) {
            // view actually annotated results.
            $(".btn_show_result").prop("disabled", true);
            var item = dataClosed.get(selectedKey);

            $(".heatmap").width("100%");

            $(".image_full_closed").attr("src", IMG_PATH + item.img_id + ".jpg");
            $(".preview_closed").attr("src", IMG_PATH + item.img_id + ".jpg");

            $(".image_full_closed").attr("image_id", item.img_id);
            $(".preview_closed").attr("image_id", item.img_id);

            $(".license_text_closed").text("©" + item.author + ' ' + item.license_name);
            map.setView([15.0, 0.0], zoom = 2);
            markerReal.setLatLng(new L.LatLng(item.gt_lat, item.gt_long));
            markerEstimated.setLatLng(new L.LatLng(item.predicted_lat, item.predicted_long));
            markerEstimated.addTo(map);
            markerReal.addTo(map);
            markerUser.setLatLng(new L.LatLng(item.marker_user_lat, item.marker_user_lng));
            map.removeLayer(heat);
            createHeatmap($(".image_full_closed"), 3, false);
            fitMapToMarker();
            // distanceTo() calculates the great circle distance (equal to stored values in csv)
            var distance_user = markerReal.getLatLng().distanceTo(markerUser.getLatLng()) / 1000;
            var distance_model = markerReal.getLatLng().distanceTo(markerEstimated.getLatLng()) / 1000;
            resultUpdate(distance_user, distance_model);
        }
    });

    $('a[data-toggle="tab"]').on("shown.bs.tab", function(e) {
        //e.relatedTarget // previous active tab
        console.log("tab changed " + e.target.id);
        selectedTab = e.target.id;

        if (selectedTab == "upload_tab_title") {
            $("#btn_random_image").hide();
            $("#annotated_total_text").addClass("list-group-item-light");
            $("#rate_of_sucess_text").addClass("list-group-item-light");
            $("#mean_error_user_text").addClass("list-group-item-light");
            $("#mean_error_model_text").addClass("list-group-item-light");
            $("#reset_image_list").prop("disabled", true);
            $("#file_upload_button").prop("disabled", true);
            $("#termsOfServiceCheckbox").prop("checked", false);
            $(".upload_text").text("");

        } else {
            $("#annotated_total_text").removeClass("list-group-item-light");
            $("#rate_of_sucess_text").removeClass("list-group-item-light");
            $("#mean_error_user_text").removeClass("list-group-item-light");
            $("#mean_error_model_text").removeClass("list-group-item-light");
            $("#reset_image_list").prop("disabled", false);

            if (selectedTab == "open_tab_title") {
                $("#btn_random_image").show();
            } else if (selectedTab == "closed_tab_title") {
                $("#btn_random_image").hide();
                if (dataClosed.size == 0) {
                    $(".alert-warning").alert();
                } else {
                    $(".alert-warning").alert("close");
                }
            }

        }

    });

    function updateTabText() {
        $("#open_tab_title").html("Open (" + dataOpen.size + "/" + (dataOpen.size + dataClosed.size) + ")");
        $("#closed_tab_title").html("Annotated (" + dataClosed.size + "/" + (dataOpen.size + dataClosed.size) + ")");
    }

    function fillHeatmap(data, radius) {
        values = [];
        var cells = data;
        var max_prob = 0.0;
        for (var cell_id in cells) {
            cell = cells[cell_id];
            if (cell.prob < eps) {
                continue
            }
            cell["radius"] = radius;
            cell.prob = Math.sqrt(cell.prob);
            values.push(cell);
            if (cell.prob > max_prob) {
                max_prob = cell.prob;
            }
        }

        var data = {
            "max": max_prob,
            "data": values
        };
        return data;
    }

    /**
     *
     * Create the heatmap for the world map and if open=true for cam heatmap as well.
     */
    function createHeatmap(img, partitioning, open) {
        console.log('calling /get_geo_prediction/' + img.attr("image_id") + '/' + partitioning);
        $.ajax({
            type: 'GET',
            url: root_url + 'get_geo_prediction/' + img.attr("image_id") + '/' + partitioning,
            beforeSend: function() {
                $(".spinner-guess-location").show();
                $(".btn").attr("disabled", true);
                $(".list-group-image-item").prop("disabled", true);
            },
            complete: function() {
                $(".spinner-guess-location").hide();
                $(".btn").attr("disabled", false);
                $(".btn_show_result").prop("disabled", true);
                $(".list-group-image-item").prop("disabled", false);
            },
            success: function(response_geo) {
                if (response_geo.hdf_content == "ERROR") {
                    console.log("Error while receiving hdf content");
                    console.log(response_geo);
                }
                // fill heatmap initial
                data = fillHeatmap(response_geo.cells, 20);
                heat = new HeatmapOverlay(cfg);
                heat.setData(data);
                map.addLayer(heat);

                calculateAndSetSceneProbabilities(img);

                // overlay input image with the CAM
                if (open) {
                    activationMapOverlay($(".image_full"), response_geo.predicted_cell_id, "heatmap")
                } else {
                    activationMapOverlay($(".image_full_closed"), response_geo.predicted_cell_id, "heatmap_closed")
                }

            },
            error: function() {
                $(".spinner-guess-location").hide();
                $(".btn").attr("disabled", false);
                $(".btn_show_result").prop("disabled", false);
                $(".list-group-image-item").prop("disabled", false);
                showError("Error while calling /get_geo_prediction/" + img.attr("image_id") + "/" + partitioning);
            }
        });
    }

    function fitMapToMarker() {
        var latitudes = [markerReal.getLatLng().lat, markerEstimated.getLatLng().lat, markerUser.getLatLng().lat];
        var longitudes = [markerReal.getLatLng().lng, markerEstimated.getLatLng().lng, markerUser.getLatLng().lng];
        var corner1 = L.latLng(Math.min(...latitudes), Math.min(...longitudes));
        var corner2 = L.latLng(Math.max(...latitudes), Math.max(...longitudes));
        map.fitBounds(L.latLngBounds(corner1, corner2), {
            padding: [50, 50]
        });
    }

    /**
     * Geo estimation for an uploaded image
     */
    function uploadEstimation() {
        var image_id = $(".image_full_upload").attr("image_id");
        var img = document.getElementById("uploaded_image");
        console.debug(img);
        if (image_id == undefined || image_id == "") {
            showError("No image selected.");
            return;
        }
        delete img.exifdata
        EXIF.getData(img, function() {
            var tags = EXIF.getAllTags(this);
            console.log(tags);

            var exif_lat = EXIF.getTag(this, "GPSLatitude");
            var exif_lng = EXIF.getTag(this, "GPSLongitude");
            var exif_lng_direction = EXIF.getTag(this, "GPSLongitudeRef")
            var exif_lat_direction = EXIF.getTag(this, "GPSLatitudeRef")

            available_EXIF = false;
            if (exif_lat && exif_lng) {
                var exif_lat_gps = get_gps_coordinate_from_exif(exif_lat)
                var exif_lng_gps = get_gps_coordinate_from_exif(exif_lng)

                if (exif_lng_direction && exif_lat_direction) {
                    if (exif_lng_direction == "W" && exif_lat_gps > 0) {
                        exif_lng_gps *= -1;
                    }
                    if (exif_lat_direction == "S" && exif_lat_gps > 0) {
                        console.log("switch lat")
                        exif_lat_gps *= -1;
                    }
                }

                available_EXIF = true;
                markerEXIF.setLatLng(new L.LatLng(exif_lat_gps, exif_lng_gps));
                markerEXIF.bindPopup("<b>EXIF:</b><br>" + markerEXIF.getLatLng().toString());
                markerEXIF.addTo(map).update();

            }
            console.log(img.exifdata);
        });
        markerUser.dragging.disable();
        move = false;

        console.log("calling /calc_output_dict/" + image_id);
        $.ajax({
            type: 'GET',
            url: root_url + 'calc_output_dict/' + image_id,
            beforeSend: function() {
                $(".spinner-guess-location").show();
                $(".btn").attr("disabled", true);
            },
            success: function(response_output_dict) {
                if (response_output_dict.hdf_content == "ERROR") {
                    console.log("Error while receiving hdf content");
                    console.log(response_output_dict);
                }

                console.log('calling /get_scene_prediction' + image_id);
                $.ajax({
                    type: 'GET',
                    url: root_url + 'get_scene_prediction/' + image_id,
                    success: function(response_scene) {
                        if (response_scene.hdf_content == "ERROR") {
                            console.log("Error while receiving scene prediction for " + image_id);
                            console.log(response_scene);
                        } else {
                            setSceneProbabilities(response_scene.p_indoor, response_scene.p_natural,
                                response_scene.p_urban, response_scene.predicted_scene_label);
                        }

                        console.log('calling /get_geo_prediction/' + image_id + '/3');
                        $.ajax({
                            type: 'GET',
                            url: root_url + 'get_geo_prediction/' + image_id + '/3',
                            complete: function() {
                                $(".spinner-guess-location").hide();
                                $(".btn").attr("disabled", false);
                                $(".btn_show_result").prop("disabled", true);
                                $(".list-group-image-item").prop("disabled", false);
                            },
                            success: function(response_geo) {
                                if (response_geo.hdf_content == "ERROR") {
                                    console.log("Error while receiving hdf content")
                                    console.log(response_geo);
                                }

                                markerEstimated.setLatLng(new L.LatLng(response_geo.predicted_lat, response_geo.predicted_lng));
                                markerEstimated.bindPopup("<b>Model:</b><br>" + markerEstimated.getLatLng().toString());
                                markerEstimated.addTo(map).update();

                                if (available_EXIF) {
                                    var distance_user = markerEXIF.getLatLng().distanceTo(markerUser.getLatLng()) / 1000;
                                    var distance_model = markerEXIF.getLatLng().distanceTo(markerEstimated.getLatLng()) / 1000;
                                    resultUpdate(distance_user, distance_model);
                                } else {
                                    $("#distance_user").html("<b>You:</b> " + "not available");
                                    $("#distance_model").html("<b>Model:</b> " + "not available");
                                }

                                heatUpload = new HeatmapOverlay(cfg);
                                heatUpload.setData(fillHeatmap(response_geo.cells, 20));
                                map.addLayer(heatUpload);

                                fitMapToMarker();

                                var predicted_cell_id = response_geo.predicted_cell_id;
                                activationMapOverlay($(".image_full_upload"), predicted_cell_id, "heatmap_upload");
                                console.debug("disable upload button after guess")
                                //$("#file_upload_button").prop("disabled", true);
                                //$("#termsOfServiceCheckbox").prop("checked", false);
                            },
                            error: function(error_response) {
                                console.log(error_response);
                                $(".spinner-guess-location").hide();
                                $(".btn").prop("disabled", false);
                                $(".list-group-image-item").prop("disabled", false);
                                $(".btn_show_result").prop("disabled", false);
                                showError("Error while calling get_geo_prediction/" + imag_id + "/3");
                            }
                        });

                    },
                    error: function(error_response) {
                        console.log(error_response);
                        $(".spinner-guess-location").hide();
                        $(".btn").prop("disabled", false);
                        $(".list-group-image-item").prop("disabled", false);
                        $(".btn_show_result").prop("disabled", false);
                        showError("Error while calling get_scene_prediction/" + image_id);
                    }
                });
            },
            error: function(error_response) {
                console.log(error_response);
                $(".spinner-guess-location").hide();
                $(".btn").prop("disabled", false);
                $(".list-group-image-item").prop("disabled", false);
                $(".btn_show_result").prop("disabled", false);
                showError("Error while calling calc_output_dict/" + image_id);
            }
        });

    }

    function quizEstimation() {
        createHeatmap($(".image_full"), 3, true);
        fitMapToMarker();
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
            $(".image_full_closed").attr("src", IMG_PATH + item.img_id + ".jpg");
            $(".image_full_closed").attr("image_id", item.img_id);
            $(".license_text_closed").text("©" + item.author + ' ' + item.license_name)
        }
        if (distance_user <= distance_model) {
            $("#list-images-closed").append("<a class='list-group-item list-group-image-item' data-toggle='list' data-alias='" + selectedKey + "' id='" + selectedKey + "'>" + "<img src='" + IMG_PATH + dataClosed.get(selectedKey).img_id + ".jpg'  alt='' class='img-fluid round-borders' style='box-shadow: 0 0 20px #5cb85c;'>" + "</a>");
        } else {
            $("#list-images-closed").append("<a class='list-group-item list-group-image-item' data-toggle='list' data-alias='" + selectedKey + "' id='" + selectedKey + "'>" + "<img src='" + IMG_PATH + dataClosed.get(selectedKey).img_id + ".jpg'  alt='' class='img-fluid round-borders' style='box-shadow: 0 0 20px #d9534f;'>" + "</a>");
        }
        dataOpen.delete(selectedKey); // remove item from dataOpen
        $("#" + selectedKey).remove(); // remove item from open image list
        updateTabText();
        // update stats and view results
        number_images++;
        distance_model_sum += distance_model;
        distance_user_sum += distance_user;
        if (distance_user < distance_model) {
            number_user_hit_model++;
        }
        $("#annotated_total_text").text("Annotated images: " + number_images)
        $("#rate_of_sucess_text").text("Rate of sucess: " + number_user_hit_model + " / " + number_images + " (" + (number_user_hit_model / number_images * 100).toFixed(0) + "%)");
        $("#mean_error_user_text").text("Your mean error: " + (distance_user_sum / number_images).toFixed(0) + " km");
        $("#mean_error_model_text").text("Model's mean error: " + (distance_model_sum / number_images).toFixed(0) + " km");

    }

    function resetQuiz() {
        map.removeLayer(markerReal);
        map.removeLayer(markerEstimated);
        map.removeLayer(heat);
        map.setView([15.0, 0.0], zoom = 2);
        markerUser.setLatLng([0.0, 0.0]);
        markerUser.dragging.enable();
        move = true;
        // set results to default
        $("#distance_model").removeClass("alert-danger alert-success").addClass("alert-secondary");
        $("#distance_user").removeClass("alert-danger alert-success").addClass("alert-secondary");
        $("#distance_user").text("You: ");
        $("#distance_model").text("Model: ");
    }

    function resetUploaded() {
        $(".heatmap-canvas").remove(); // really all activation maps overlays?
        map.removeLayer(markerEXIF);
        map.removeLayer(markerEstimated);
        map.removeLayer(heatUpload);
        map.setView([15.0, 0.0], zoom = 2);
        //markerUser.setLatLng([0.0, 0.0]);
        markerUser.dragging.enable();
        move = true;
        $("#prob_indoor_text").text("Probability indoor: --- ");
        $("#prob_natural_text").text("Probability nature: ---");
        $("#prob_urban_text").text("Probability urban: ---");
        $("#predicted_scene_text").text("Predicted scene: ---");
        $("#distance_model").removeClass("alert-danger alert-success").addClass("alert-secondary");
        $("#distance_user").removeClass("alert-danger alert-success").addClass("alert-secondary");
        $("#distance_user").text("You: ");
        $("#distance_model").text("Model: ");
        $(".btn_show_result").prop("disabled", false);
    }

    $("#reset_user_upload").click(function() {
        $(".image_full_upload").attr("src", "");
        $(".image_full_upload").attr("image_id", "");
        resetUploaded();
        $("#file_upload_button").prop("disabled", true);
        $("#termsOfServiceCheckbox").prop("checked", false);
        $(".upload_text").text("");
    });

    /**
     * Event listener for Guess Location button click.
     *
     */
    $(".btn_show_result").click(function() {
        $(this).prop("disabled", true);
    
        if (selectedTab == "upload_tab_title") {
            // use uploaded image for estimation
            //resetQuiz();        
            uploadEstimation();
        } else {
            resetUploaded();
            quizEstimation();
        }
        return;
    });
    // update user marker when click on map
    function onMapClick(e) {
        if (!move) {
            return;
        }
        markerUser.setLatLng(e.latlng);
        markerUser.bindPopup("<b>Your estimation:</b><br>" + e.latlng.toString());
    }

    // #################################################################################################################
    // When DOCUMENT ready
    // #################################################################################################################

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

//    L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
//        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' + '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' + 'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
//        id: 'mapbox.streets',
//        maxZoom: 13,
//        noWrap: true
//    }).addTo(map);

    map.on("click", onMapClick); // set click listener
    markerUser.addTo(map); // add user marker
    // default style of the results
    $("#distance_model").removeClass("alert-danger alert-success").addClass("alert-secondary");
    $("#distance_user").removeClass("alert-danger alert-success").addClass("alert-secondary");
    $("#distance_user").text("You: ");
    $("#distance_model").text("Model: ");
    initialize_data();
    updateMapSize();
});
