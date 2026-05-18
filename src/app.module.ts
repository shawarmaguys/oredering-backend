import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LocationsModule } from './locations/locations.module';
import { VendorsModule } from './vendors/vendors.module';
import { ItemsModule } from './items/items.module';
import { StockRecordsModule } from './stock-records/stock-records.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { SchedulesModule } from './schedules/schedules.module';
import { TranslationsModule } from './translations/translations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    LocationsModule,
    VendorsModule,
    ItemsModule,
    StockRecordsModule,
    PurchaseOrdersModule,
    SchedulesModule,
    TranslationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
