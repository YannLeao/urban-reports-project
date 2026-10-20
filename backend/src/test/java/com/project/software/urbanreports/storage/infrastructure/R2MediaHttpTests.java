package com.project.software.urbanreports.storage.infrastructure;

import com.sun.net.httpserver.HttpServer;
import java.io.*;
import java.net.*;
import java.time.Duration;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.http.apache.ApacheHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import static org.assertj.core.api.Assertions.*;

/** Real SDK/Apache against a controlled local origin, without R2. */
class R2MediaHttpTests {
    @Test void headAndRangeUseWireHeadersAndExactBytes() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var gets=new AtomicInteger();var heads=new AtomicInteger();var range=new AtomicReference<String>();
        server.createContext("/synthetic/opaque",exchange->{
            exchange.getResponseHeaders().set("Content-Type","video/mp4");
            if(exchange.getRequestMethod().equals("HEAD")) {
                heads.incrementAndGet();exchange.getResponseHeaders().set("Content-Length","10");exchange.sendResponseHeaders(200,-1);
            } else {
                gets.incrementAndGet();range.set(exchange.getRequestHeaders().getFirst("Range"));
                exchange.getResponseHeaders().set("Content-Range","bytes 2-4/10");exchange.sendResponseHeaders(206,3);
                exchange.getResponseBody().write(new byte[]{2,3,4});
            }
            exchange.close();
        });server.start();
        try(var s3=client(server)) {
            var storage=storage(s3,server);
            assertThat(storage.head("opaque").size()).isEqualTo(10);assertThat(heads).hasValue(1);assertThat(gets).hasValue(0);
            try(var body=storage.open("opaque",2L,4L)) {assertThat(body.input().readNBytes(3)).containsExactly(2,3,4);}
            assertThat(range).hasValue("bytes=2-4");assertThat(gets).hasValue(1);
        } finally {server.stop(0);}
    }
    @Test void abortClosesSocketWithoutDrainingRemainder() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var proceed=new CountDownLatch(1);var ended=new CountDownLatch(1);var written=new AtomicInteger();int total=10*1024*1024;
        server.createContext("/synthetic/opaque",exchange->{
            try {
                exchange.getResponseHeaders().set("Content-Type","video/mp4");exchange.sendResponseHeaders(200,total);
                byte[] chunk=new byte[1024];exchange.getResponseBody().write(chunk);exchange.getResponseBody().flush();written.addAndGet(chunk.length);
                try {proceed.await(5,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}
                while(written.get()<total){exchange.getResponseBody().write(chunk);exchange.getResponseBody().flush();written.addAndGet(chunk.length);}
            }catch(IOException expected){}finally{exchange.close();ended.countDown();}
        });server.start();
        try(var s3=client(server)) {
            var body=storage(s3,server).open("opaque",null,null);assertThat(body.input().read()).isEqualTo(0);
            body.abort();proceed.countDown();assertThat(ended.await(5,TimeUnit.SECONDS)).isTrue();assertThat(written.get()).isLessThan(total);
        }finally{proceed.countDown();server.stop(0);}
    }
    @Test void transportReadTimeoutAfterHeadersIsFinite() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);var release=new CountDownLatch(1);
        server.createContext("/synthetic/opaque",exchange->{
            try{exchange.getResponseHeaders().set("Content-Type","video/mp4");exchange.sendResponseHeaders(200,10);exchange.getResponseBody().flush();release.await(5,TimeUnit.SECONDS);}
            catch(InterruptedException e){Thread.currentThread().interrupt();}finally{exchange.close();}
        });server.start();
        try(var s3=client(server)) {
            var body=storage(s3,server).open("opaque",null,null);
            try{assertThatThrownBy(()->body.input().read()).isInstanceOf(IOException.class);}finally{body.abort();}
        }finally{release.countDown();server.stop(0);}
    }
    private S3Client client(HttpServer server){
        return S3Client.builder().endpointOverride(endpoint(server)).region(Region.US_EAST_1)
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("synthetic","synthetic"))).forcePathStyle(true)
            .httpClientBuilder(ApacheHttpClient.builder().maxConnections(1).connectionAcquisitionTimeout(Duration.ofMillis(500)).socketTimeout(Duration.ofMillis(500)))
            .overrideConfiguration(c->c.apiCallTimeout(Duration.ofSeconds(5))).build();
    }
    private URI endpoint(HttpServer server){return URI.create("http://127.0.0.1:"+server.getAddress().getPort());}
    private R2ImageStorage storage(S3Client s3,HttpServer server){return new R2ImageStorage(s3,new R2StorageProperties(endpoint(server),"auto","synthetic","synthetic","synthetic"));}
}
