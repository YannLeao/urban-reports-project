package com.project.software.urbanreports.occurrence;

import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class MediaMultipartAdmissionTests {
    @Test void limitsRequestsBeforePartsAreParsedAndReleasesAdmissionOnFailure() throws Exception {
        var filter = new MediaMultipartAdmission(JsonMapper.builder().build());
        var entered = new CountDownLatch(2); var release = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var tasks = new java.util.ArrayList<Future<?>>();
            for(int i=0;i<2;i++) tasks.add(workers.submit(() -> {
                try {
                    var request = new MockHttpServletRequest("POST","/api/occurrences"); request.setContentType("multipart/form-data; boundary=synthetic");
                    filter.doFilter(request,new MockHttpServletResponse(),(a,b) -> {
                        entered.countDown(); try { release.await(5,TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                        throw new java.io.IOException("synthetic failure");
                    });
                } catch(java.io.IOException expected) { } catch(jakarta.servlet.ServletException failure) { throw new RuntimeException(failure); }
            }));
            try {
                assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();
                var request = new MockHttpServletRequest("POST","/api/occurrences"); request.setContentType("multipart/form-data");
                var response = new MockHttpServletResponse();
                filter.doFilter(request,response,(a,b) -> { throw new AssertionError("Must not reach multipart parsing"); });
                assertThat(response.getStatus()).isEqualTo(503); assertThat(response.getContentAsString()).contains("MEDIA_BUSY");
                for(String path:java.util.List.of("/api/occurrences/not-a-uuid", "/api/auth/login")) {
                    var malformed=new MockHttpServletRequest("POST",path);malformed.setContentType("multipart/mixed");
                    var blocked=new MockHttpServletResponse();
                    filter.doFilter(malformed,blocked,(a,b)->{throw new AssertionError("Invalid routes must not bypass spool admission");});
                    assertThat(blocked.getStatus()).isEqualTo(503);
                }
            } finally { release.countDown(); }
            for(var task:tasks)task.get(5,TimeUnit.SECONDS);
        }
        var request = new MockHttpServletRequest("POST","/api/occurrences"); request.setContentType("multipart/form-data");
        var reached = new java.util.concurrent.atomic.AtomicBoolean();
        filter.doFilter(request,new MockHttpServletResponse(),(a,b)->reached.set(true)); assertThat(reached).isTrue();
    }
}
