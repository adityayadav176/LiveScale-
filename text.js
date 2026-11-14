
import http from "k6/http";
import { sleep, check } from "k6";

export const options = {
    vus: 10,
    duration: "30s",
};

export default function () {

    const url = "http://localhost:9000/api/v1/auth/login";

    const payload = JSON.stringify({
        email: "ay6598aditya@gmail.com",
        password: "microsoft2027",
        username: "aditya176$livescale"
    });

    const params = {
        headers: {
            "Content-Type": "application/json"
        }
    };

    const response = http.post(url, payload, params);

    check(response, {
        "Login successful": (r) => r.status === 200,
        "Response time below 500ms": (r) => r.timings.duration < 500
    });

    sleep(1);
}
